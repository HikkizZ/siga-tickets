import { randomUUID } from "node:crypto";
import { AppDataSource } from "../config/dataSource.js";
import { Adjunto } from "../entities/Adjunto.js";
import { MensajeTicket } from "../entities/MensajeTicket.js";
import { Ticket } from "../entities/Ticket.js";
import { EntidadAdjunto, EstadoTicket, TipoMensajeTicket } from "../entities/enums.js";
import { AppError } from "../errors/AppError.js";
import { exigir, puedePublicarMensaje } from "../policies/ticket.policy.js";
import { toAdjuntoDto } from "./adjunto.dto.js";
import { registrarEventoTicket } from "./evento.service.js";
import { enTransaccion } from "./folio.service.js";
import { ahoraDb, type UsuarioActor } from "./ot.common.js";
import { bloquearTicket, contextoTicket } from "./ticket.common.js";
import { toMensajeDto } from "./ticket.service.js";

export interface CrearMensajeInput {
  tipo: "respuesta_cliente" | "nota_interna";
  cuerpo: string;
  adjuntoIds?: string[] | undefined;
}

// Adjuntos: se suben SUELTOS al ticket de antemano (POST /adjuntos con entidadTipo=ticket) y
// adjuntoIds aquí simplemente los "re-parenta" al mensaje recién creado (entidad_tipo pasa de
// 'ticket' a 'mensaje'). Decisión más simple que subir directo a un mensaje que aún no existe
// (ver punto 4 del encargo de la Fase 3, documentado también en backend-diseno.md).
export async function crearMensaje(actor: UsuarioActor, ticketId: string, input: CrearMensajeInput) {
  const mensajeId = randomUUID();
  await enTransaccion(AppDataSource, async (m) => {
    const ticket = await bloquearTicket(m, ticketId);
    exigir(puedePublicarMensaje(contextoTicket(ticket, actor)), "Solo el responsable actual, gestión o admin publican mensajes");

    await m.save(
      MensajeTicket,
      m.create(MensajeTicket, {
        id: mensajeId,
        ticketId,
        tipo: input.tipo as TipoMensajeTicket,
        autorId: actor.id,
        cuerpo: input.cuerpo,
      }),
    );

    const adjuntoIds = [...new Set(input.adjuntoIds ?? [])];
    if (adjuntoIds.length > 0) {
      for (const adjId of adjuntoIds) {
        await m.query(
          `UPDATE adjunto SET entidad_tipo = 'mensaje', entidad_id = @0 WHERE id = @1 AND entidad_tipo = 'ticket' AND entidad_id = @2`,
          [mensajeId, adjId, ticketId],
        );
      }
      const movidos: Array<{ n: number }> = await m.query(
        `SELECT COUNT(*) AS n FROM adjunto WHERE entidad_tipo = 'mensaje' AND entidad_id = @0`,
        [mensajeId],
      );
      if (Number(movidos[0]!.n) !== adjuntoIds.length) {
        throw new AppError(400, "ADJUNTO_INVALIDO", "Uno o más adjuntoIds no son adjuntos sueltos de este ticket");
      }
    }

    if (input.tipo === "respuesta_cliente") {
      let cambio = false;
      if (ticket.primeraRespuestaEn === null) {
        ticket.primeraRespuestaEn = await ahoraDb(m);
        cambio = true;
      }
      if (ticket.estado === EstadoTicket.NUEVO) {
        ticket.estado = EstadoTicket.ABIERTO;
        cambio = true;
      }
      // Si estaba esperando_cliente, resuelto o cerrado, una respuesta_cliente del equipo NO
      // reabre nada (reabrir es cosa de una respuesta DEL CLIENTE, que no existe en esta fase):
      // se agrega al hilo sin tocar el estado.
      if (cambio) await m.save(Ticket, ticket);
    }

    await registrarEventoTicket(m, ticketId, actor.id, { tipo: input.tipo, mensajeId });
  });

  const mensaje = await AppDataSource.getRepository(MensajeTicket).findOneOrFail({ where: { id: mensajeId }, relations: { autor: true } });
  const adjuntos = await AppDataSource.getRepository(Adjunto).find({
    where: { entidadTipo: EntidadAdjunto.MENSAJE, entidadId: mensajeId },
    relations: { subidoPor: true },
    order: { creadoEn: "ASC" },
  });
  return toMensajeDto(mensaje, adjuntos.map(toAdjuntoDto));
}
