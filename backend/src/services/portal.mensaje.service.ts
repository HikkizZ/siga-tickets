import { randomUUID } from "node:crypto";
import { AppDataSource } from "../config/dataSource.js";
import { MensajeTicket } from "../entities/MensajeTicket.js";
import { Ticket } from "../entities/Ticket.js";
import { EntidadAdjunto, EstadoTicket, TipoMensajeTicket } from "../entities/enums.js";
import type { ArchivoSubido } from "./adjunto.service.js";
import { guardarAdjunto, validarArchivo, verificarCuotaAdjunto } from "./adjunto.service.js";
import { registrarEventoTicket } from "./evento.service.js";
import { enTransaccion } from "./folio.service.js";
import { ahoraDb } from "./ot.common.js";
import { cerrarPausaYCorrerVencimientos } from "./sla.pausa.service.js";
import { bloquearTicket } from "./ticket.common.js";
import { obtenerUsuarioSistemaId } from "./usuarioSistema.service.js";

export interface CrearMensajePortalInput {
  cuerpo: string;
  archivos: ArchivoSubido[];
}

// Punto 7 del encargo: mensaje del cliente desde el portal. tipo='cliente', autor_id=NULL,
// autor_externo=correo del ticket (lo exige el CHECK de mensaje_ticket). Los adjuntos van sueltos
// al ticket (entidadTipo='ticket'), mismo criterio que la creación (punto 1), no re-parentados a
// este mensaje. Los eventos se atribuyen a 'sistema' (el portal no tiene un actor interno; ver
// services/usuarioSistema.service.ts).
export async function crearMensajePortal(ticketId: string, input: CrearMensajePortalInput) {
  const mensajeId = randomUUID();

  await enTransaccion(AppDataSource, async (m) => {
    const ticket = await bloquearTicket(m, ticketId);
    const sistemaId = await obtenerUsuarioSistemaId(m);

    await m.save(
      MensajeTicket,
      m.create(MensajeTicket, {
        id: mensajeId,
        ticketId,
        tipo: TipoMensajeTicket.CLIENTE,
        autorId: null,
        autorExterno: ticket.solicitanteEmail,
        cuerpo: input.cuerpo,
      }),
    );

    for (const archivoCrudo of input.archivos) {
      const archivo = validarArchivo(archivoCrudo);
      await verificarCuotaAdjunto(m, EntidadAdjunto.TICKET, ticketId, archivo.tamano);
      const a = await guardarAdjunto(m, EntidadAdjunto.TICKET, ticketId, archivo, null);
      await registrarEventoTicket(m, ticketId, sistemaId, { tipo: "adjunto_agregado", adjuntoId: a.id, mime: a.mime, tamanoBytes: a.tamanoBytes });
    }

    // Reabre esperando_cliente/resuelto -> abierto y cierra la pausa de SLA activa; cerrado NO se
    // reabre automáticamente (decisión del staff, punto 7 del encargo).
    if (ticket.estado === EstadoTicket.ESPERANDO_CLIENTE || ticket.estado === EstadoTicket.RESUELTO) {
      const anterior = ticket.estado;
      const ahora = await ahoraDb(m);
      if (anterior === EstadoTicket.ESPERANDO_CLIENTE) {
        await cerrarPausaYCorrerVencimientos(m, ticket, ahora);
      }
      ticket.estado = EstadoTicket.ABIERTO;
      await m.save(Ticket, ticket);
      await registrarEventoTicket(m, ticketId, sistemaId, { tipo: "estado_cambiado", de: anterior, a: EstadoTicket.ABIERTO });
    }

    await registrarEventoTicket(m, ticketId, sistemaId, { tipo: "mensaje_cliente", mensajeId });
  });

  const mensaje = await AppDataSource.getRepository(MensajeTicket).findOneOrFail({ where: { id: mensajeId } });
  return { id: mensaje.id, cuerpo: mensaje.cuerpo, creadoEn: mensaje.creadoEn };
}
