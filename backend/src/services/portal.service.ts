import { randomUUID } from "node:crypto";
import { Not } from "typeorm";
import { AppDataSource } from "../config/dataSource.js";
import { env } from "../config/env.js";
import { MensajeTicket } from "../entities/MensajeTicket.js";
import { Ticket } from "../entities/Ticket.js";
import { CanalTicket, EntidadAdjunto, EstadoTicket, TipoMensajeTicket, type Prioridad } from "../entities/enums.js";
import type { ArchivoSubido } from "./adjunto.service.js";
import { guardarAdjunto, validarArchivo, verificarCuotaAdjunto } from "./adjunto.service.js";
import { encolarCorreo } from "./correo.service.js";
import { registrarEventoTicket } from "./evento.service.js";
import { enTransaccion, siguienteFolio } from "./folio.service.js";
import { ahoraDb } from "./ot.common.js";
import { calcularVencimientosTicket } from "./sla.calculo.service.js";
import { ticketNoEncontrado } from "./ticket.common.js";
import { obtenerUsuarioSistemaId } from "./usuarioSistema.service.js";

// ------------------------------------------------------------------ crear (POST /publico/tickets)

export interface CrearTicketPublicoInput {
  nombre: string;
  correo: string;
  empresa?: string | undefined;
  asunto: string;
  descripcion: string;
  prioridad: Prioridad;
  archivos: ArchivoSubido[];
}

export async function crearTicketPublico(input: CrearTicketPublicoInput): Promise<{ numero: string }> {
  const ticketId = randomUUID();

  const numero = await enTransaccion(AppDataSource, async (m) => {
    const sistemaId = await obtenerUsuarioSistemaId(m);

    const numero = await siguienteFolio(m, "TK");
    const fechaIngreso = await ahoraDb(m);
    const { slaResolucionVenceEn, slaRespuestaVenceEn } = await calcularVencimientosTicket(m, input.prioridad, fechaIngreso);

    await m.save(
      Ticket,
      m.create(Ticket, {
        id: ticketId,
        numero,
        asunto: input.asunto,
        descripcion: input.descripcion,
        solicitanteNombre: input.nombre,
        solicitanteEmail: input.correo,
        solicitanteTelefono: null,
        solicitanteEmpresa: input.empresa ?? null,
        clienteId: null,
        canal: CanalTicket.PORTAL,
        prioridad: input.prioridad,
        estado: EstadoTicket.NUEVO,
        fechaIngreso,
        recepcionadoPorId: sistemaId, // nunca del body: el portal no tiene sesión (ver encargo punto 1)
        responsableActualId: null,
        slaResolucionVenceEn,
        slaRespuestaVenceEn,
      }),
    );

    await registrarEventoTicket(m, ticketId, sistemaId, {
      tipo: "creado",
      numero,
      canal: CanalTicket.PORTAL,
      recepcionadoPorId: sistemaId,
      clienteId: null,
    });

    // Adjuntos DESPUÉS del ticket, en la misma transacción (punto 1 del encargo): un archivo
    // inválido revierte también el ticket recién creado (y el folio, dentro de la misma tx).
    for (const archivoCrudo of input.archivos) {
      const archivo = validarArchivo(archivoCrudo);
      await verificarCuotaAdjunto(m, EntidadAdjunto.TICKET, ticketId, archivo.tamano);
      const a = await guardarAdjunto(m, EntidadAdjunto.TICKET, ticketId, archivo, null);
      await registrarEventoTicket(m, ticketId, sistemaId, { tipo: "adjunto_agregado", adjuntoId: a.id, mime: a.mime, tamanoBytes: a.tamanoBytes });
    }

    // Outbox transaccional (punto 9.a): autorespuesta al solicitante + aviso a soporte@, ambos
    // encolados aquí, nunca enviados de forma síncrona en el request.
    await encolarCorreo(m, {
      numero,
      para: input.correo,
      plantilla: "ticket_creado",
      datos: { numero, asunto: input.asunto, nombreSolicitante: input.nombre },
    });
    await encolarCorreo(m, {
      numero,
      para: env.mail.soporteEmail,
      plantilla: "aviso_soporte",
      datos: { numero, asunto: input.asunto, nombreSolicitante: input.nombre, correoSolicitante: input.correo },
      // Evita un bucle si alguna vez se llegara a leer ese buzón automáticamente (Fase 6).
      headersExtra: { "Auto-Submitted": "auto-generated" },
    });

    return numero;
  });

  return { numero };
}

// ------------------------------------------------------------------ ver (GET /publico/ticket)

interface OtPortal {
  estado: string;
  fechaEstimadaTermino: string | null;
  responsableNombre: string | null;
}

// Construido campo a campo: nunca spread de la entidad ni reutiliza el DTO interno. Nunca horas,
// montos, cotizaciones ni otros datos internos (punto 6 del encargo).
export function toPortalOt(ot: OtPortal) {
  return {
    estado: ot.estado,
    fechaEstimadaTermino: ot.fechaEstimadaTermino,
    responsableNombre: ot.responsableNombre,
  };
}

interface MensajePortalOrigen {
  id: string;
  tipo: TipoMensajeTicket;
  cuerpo: string;
  creadoEn: Date;
}

export function toPortalTicket(ticket: Ticket, mensajes: MensajePortalOrigen[], ot: OtPortal | null) {
  return {
    numero: ticket.numero,
    asunto: ticket.asunto,
    descripcion: ticket.descripcion,
    estado: ticket.estado,
    fechaIngreso: ticket.fechaIngreso,
    mensajes: mensajes.map((m) => ({
      id: m.id,
      tipo: m.tipo,
      cuerpo: m.cuerpo,
      creadoEn: m.creadoEn,
    })),
    ot: ot ? toPortalOt(ot) : null,
  };
}

// Extraída de obtenerTicketPortal (Fase 5) para que el detalle de un ticket por cuenta de portal
// (Fase D, GET /publico/cuentas/tickets/:numero) reutilice exactamente la misma proyección sin
// duplicar la consulta de mensajes/OT vinculada: recibe el ticket ya resuelto (por id o por
// número+pertenencia, según el llamador) y arma el mismo DTO reducido.
export async function construirDetalleTicketPortal(ticket: Ticket) {
  // Excluye nota_interna con un WHERE en la consulta (Not(...) → `tipo <> @0`), nunca con un
  // filtro en memoria (mismo criterio ya previsto para el portal desde la Fase 3, ver
  // entities/MensajeTicket.ts).
  const mensajes = await AppDataSource.getRepository(MensajeTicket).find({
    where: { ticketId: ticket.id, tipo: Not(TipoMensajeTicket.NOTA_INTERNA) },
    order: { creadoEn: "ASC" },
  });

  const otsVinculadas: Array<{ estado: string; fecha_estimada_termino: string | null; responsable_nombre: string | null }> =
    await AppDataSource.query(
      `SELECT TOP 1 o.estado, CONVERT(varchar(10), o.fecha_estimada_termino, 23) AS fecha_estimada_termino, r.nombre AS responsable_nombre
       FROM ticket_ot tv
       JOIN ot o ON o.id = tv.ot_id
       LEFT JOIN usuario r ON r.id = o.responsable_actual_id
       WHERE tv.ticket_id = @0
       ORDER BY tv.es_origen DESC, tv.creado_en ASC`,
      [ticket.id],
    );

  const ot = otsVinculadas[0]
    ? { estado: otsVinculadas[0].estado, fechaEstimadaTermino: otsVinculadas[0].fecha_estimada_termino, responsableNombre: otsVinculadas[0].responsable_nombre }
    : null;

  return toPortalTicket(ticket, mensajes, ot);
}

export async function obtenerTicketPortal(ticketId: string) {
  const ticket = await AppDataSource.getRepository(Ticket).findOne({ where: { id: ticketId } });
  if (!ticket) throw ticketNoEncontrado();
  return construirDetalleTicketPortal(ticket);
}
