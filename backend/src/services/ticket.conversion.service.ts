import { randomUUID } from "node:crypto";
import { AppDataSource } from "../config/dataSource.js";
import { Ot } from "../entities/Ot.js";
import { TicketOt } from "../entities/TicketOt.js";
import { CanalTicket, CategoriaOt, EstadoOt, OrigenOt, type Prioridad } from "../entities/enums.js";
import { AppError } from "../errors/AppError.js";
import { violacionUnica } from "../errors/dbErrors.js";
import { exigirConversion } from "../policies/ticket.policy.js";
import { problemasConsistenciaInterna } from "../validations/ot.validation.js";
import { registrarEventoOt, registrarEventoTicket } from "./evento.service.js";
import { enTransaccion, siguienteFolio } from "./folio.service.js";
import { otNoEncontrada, type UsuarioActor } from "./ot.common.js";
import { obtenerDetalleOt } from "./ot.service.js";
import { bloquearTicket } from "./ticket.common.js";
import { exigirClienteActivoTicket, obtenerDetalleTicket } from "./ticket.service.js";

// El canal del ticket fija el origen de la OT (no editable en el body).
const ORIGEN_POR_CANAL: Record<CanalTicket, OrigenOt> = {
  [CanalTicket.PORTAL]: OrigenOt.MESA_AYUDA,
  [CanalTicket.CORREO]: OrigenOt.CORREO,
  [CanalTicket.TELEFONO]: OrigenOt.TELEFONO,
  [CanalTicket.PRESENCIAL]: OrigenOt.PRESENCIAL,
  [CanalTicket.INTERNO]: OrigenOt.INTERNA,
};

export interface ConvertirATicketOtInput {
  titulo?: string | undefined;
  descripcion?: string | undefined;
  categoria: CategoriaOt;
  prioridad?: Prioridad | undefined;
  ubicacion?: string | undefined;
  fechaEstimadaTermino?: string | undefined;
  clienteId?: string | undefined;
  areaInterna?: string | undefined;
  esInterna?: boolean | undefined;
}

// "Herencia completa" (punto 8 del encargo de la Fase 3): título/descripción/prioridad por
// defecto del ticket, origen derivado del canal, recepcionado_por heredado (NUNCA el actor),
// cadena de responsables copiada tramo a tramo con sus timestamps y motivos originales.
export async function convertirATicketOt(actor: UsuarioActor, ticketId: string, input: ConvertirATicketOtInput) {
  exigirConversion(actor.rol);
  const otId = randomUUID();

  await enTransaccion(AppDataSource, async (m) => {
    const ticket = await bloquearTicket(m, ticketId);

    const esInterna = input.esInterna ?? false;
    let clienteId: string | null = input.clienteId ?? ticket.clienteId ?? null;
    if (esInterna) clienteId = null;
    if (!esInterna && !clienteId) {
      throw new AppError(400, "CLIENTE_INVALIDO", "No se pudo inferir clienteId del ticket: especifícalo o indica esInterna");
    }

    // Reutiliza (no reimplementa) el CHECK ot_interna_check ya factorizado en ot.validation.ts.
    const problemas = problemasConsistenciaInterna({ esInterna, clienteId, areaInterna: input.areaInterna });
    if (problemas.length > 0) {
      throw new AppError(400, "VALIDATION_ERROR", problemas.map((p) => p.mensaje).join("; "), problemas);
    }
    if (clienteId) await exigirClienteActivoTicket(m, clienteId);

    const numero = await siguienteFolio(m, "OT");
    const origen = ORIGEN_POR_CANAL[ticket.canal];

    const ot = await m.save(
      Ot,
      m.create(Ot, {
        id: otId,
        numero,
        titulo: input.titulo ?? ticket.asunto,
        descripcion: input.descripcion ?? ticket.descripcion,
        esInterna,
        clienteId: esInterna ? null : clienteId,
        areaInterna: esInterna ? (input.areaInterna ?? null) : null,
        categoria: input.categoria,
        prioridad: input.prioridad ?? ticket.prioridad,
        origen,
        ubicacion: input.ubicacion ?? null,
        solicitanteNombre: ticket.solicitanteNombre ?? null,
        solicitanteContacto: ticket.solicitanteEmail ?? ticket.solicitanteTelefono ?? null,
        fechaEstimadaTermino: input.fechaEstimadaTermino ?? null,
        estado: EstadoOt.INGRESADO,
        recepcionadoPorId: ticket.recepcionadoPorId, // quien recibió el TICKET, nunca quien convierte
        responsableActualId: ticket.responsableActualId,
      }),
    );

    // Copia fiel de la cadena de responsables del ticket (mismos usuario_id/desde/hasta/motivo/derivado_por).
    const tramos: Array<{ usuario_id: string; desde: Date; hasta: Date | null; motivo_entrada: string | null; derivado_por_id: string | null }> =
      await m.query(
        `SELECT usuario_id, desde, hasta, motivo_entrada, derivado_por_id
         FROM asignacion WHERE entidad_tipo = 'ticket' AND entidad_id = @0 ORDER BY desde ASC`,
        [ticketId],
      );

    if (tramos.length === 0) {
      // Caso borde: el ticket nunca se tomó. La OT arranca su cadena con un único tramo abierto
      // para quien convierte (no hay a quién más asignárselo).
      await m.query(
        `INSERT INTO asignacion (id, entidad_tipo, entidad_id, usuario_id, desde)
         VALUES (@0, 'ot', @1, @2, CAST(@3 AS datetimeoffset(3)))`,
        [randomUUID(), otId, actor.id, ot.fechaIngreso.toISOString()],
      );
      ot.responsableActualId = actor.id;
      await m.save(Ot, ot);
    } else {
      for (const t of tramos) {
        await m.query(
          `INSERT INTO asignacion (id, entidad_tipo, entidad_id, usuario_id, desde, hasta, motivo_entrada, derivado_por_id)
           VALUES (@0, 'ot', @1, @2, CAST(@3 AS datetimeoffset(3)), ${t.hasta ? "CAST(@4 AS datetimeoffset(3))" : "NULL"}, @5, @6)`,
          [randomUUID(), otId, t.usuario_id, t.desde.toISOString(), t.hasta ? t.hasta.toISOString() : null, t.motivo_entrada, t.derivado_por_id],
        );
      }
      // responsableActualId ya quedó igual al del ticket (el último tramo, el abierto).
    }

    await m.insert(TicketOt, { ticketId, otId, esOrigen: true, vinculadoPorId: actor.id });

    await registrarEventoOt(m, otId, actor.id, {
      tipo: "creado",
      numero,
      responsableId: ot.responsableActualId!,
      clienteId: ot.clienteId,
      esInterna,
      origenTicketId: ticketId,
      origenTicketNumero: ticket.numero,
    });
    await registrarEventoTicket(m, ticketId, actor.id, { tipo: "vinculado_ot", otId, otNumero: numero, esOrigen: true });
  });

  return obtenerDetalleOt(otId);
}

// Vincula una OT EXISTENTE a un ticket, sin herencia (punto 9). El índice único filtrado de la
// BD (uq_ticket_ot_origen) ya impide dos orígenes para la misma OT; este vínculo siempre nace con
// esOrigen=false, así que nunca lo puede violar.
export async function vincularOtExistente(actor: UsuarioActor, ticketId: string, otId: string) {
  exigirConversion(actor.rol);

  await enTransaccion(AppDataSource, async (m) => {
    await bloquearTicket(m, ticketId);
    const ot = await m.findOne(Ot, { where: { id: otId } });
    if (!ot) throw otNoEncontrada();

    try {
      await m.insert(TicketOt, { ticketId, otId, esOrigen: false, vinculadoPorId: actor.id });
    } catch (err) {
      if (violacionUnica(err)) throw new AppError(409, "TICKET_OT_YA_VINCULADO", "Ese ticket ya está vinculado a esa OT");
      throw err;
    }
    await registrarEventoTicket(m, ticketId, actor.id, { tipo: "vinculado_ot", otId, otNumero: ot.numero, esOrigen: false });
  });

  return obtenerDetalleTicket(ticketId);
}

// Quita el vínculo cruzado de navegación; NO deshace lo ya heredado en la OT si vino de una
// conversión (herencia y vínculo son cosas separadas a propósito).
export async function desvincularOt(actor: UsuarioActor, ticketId: string, otId: string): Promise<void> {
  exigirConversion(actor.rol);

  await enTransaccion(AppDataSource, async (m) => {
    await bloquearTicket(m, ticketId);
    const ot = await m.findOne(Ot, { where: { id: otId } });
    if (!ot) throw otNoEncontrada();

    const r = await m.delete(TicketOt, { ticketId, otId });
    if (!r.affected) throw new AppError(404, "TICKET_OT_NO_ENCONTRADO", "Ese ticket no está vinculado a esa OT");

    await registrarEventoTicket(m, ticketId, actor.id, { tipo: "ot_desvinculada", otId, otNumero: ot.numero });
  });
}
