import type { Readable } from "node:stream";
import { AppDataSource } from "../config/dataSource.js";
import { Adjunto } from "../entities/Adjunto.js";
import { MensajeTicket } from "../entities/MensajeTicket.js";
import { EntidadAdjunto, TipoMensajeTicket } from "../entities/enums.js";
import { AppError } from "../errors/AppError.js";
import { abrirAdjunto, guardarAdjunto, validarArchivo, verificarCuotaAdjunto, type ArchivoSubido } from "./adjunto.service.js";
import { registrarEventoTicket } from "./evento.service.js";
import { enTransaccion } from "./folio.service.js";
import { bloquearTicket } from "./ticket.common.js";
import { obtenerUsuarioSistemaId } from "./usuarioSistema.service.js";

// Punto 8: sube UN archivo adicional al ticket del token, fuera del flujo de creación o de un
// mensaje puntual (evidencia agregada después). Devuelve solo { id }.
export async function subirAdjuntoPortal(ticketId: string, archivoCrudo: ArchivoSubido): Promise<{ id: string }> {
  const archivo = validarArchivo(archivoCrudo);

  const id = await enTransaccion(AppDataSource, async (m) => {
    await bloquearTicket(m, ticketId);
    const sistemaId = await obtenerUsuarioSistemaId(m);

    await verificarCuotaAdjunto(m, EntidadAdjunto.TICKET, ticketId, archivo.tamano);
    const a = await guardarAdjunto(m, EntidadAdjunto.TICKET, ticketId, archivo, null);
    await registrarEventoTicket(m, ticketId, sistemaId, { tipo: "adjunto_agregado", adjuntoId: a.id, mime: a.mime, tamanoBytes: a.tamanoBytes });
    return a.id;
  });

  return { id };
}

const NO_ENCONTRADO = () => new AppError(404, "ADJUNTO_NO_ENCONTRADO", "Adjunto no encontrado");

// Punto 8: solo permite la descarga si el adjunto pertenece al ticket del token, directamente
// (entidadTipo='ticket') o a través de un mensaje de ESE ticket cuyo tipo sea 'cliente' o
// 'respuesta_cliente' (nunca 'nota_interna', aunque el id sea válido y el mensaje sea del mismo
// ticket). Si no cumple: 404, nunca 403 — no revela que el recurso existe (mismo principio que las
// notificaciones de la Fase 4).
async function perteneceAlTicket(adjunto: Adjunto, ticketId: string): Promise<boolean> {
  if (adjunto.entidadTipo === EntidadAdjunto.TICKET) {
    return adjunto.entidadId.toLowerCase() === ticketId.toLowerCase();
  }
  if (adjunto.entidadTipo === EntidadAdjunto.MENSAJE) {
    const mensaje = await AppDataSource.getRepository(MensajeTicket).findOne({ where: { id: adjunto.entidadId } });
    if (!mensaje || mensaje.ticketId.toLowerCase() !== ticketId.toLowerCase()) return false;
    return mensaje.tipo === TipoMensajeTicket.CLIENTE || mensaje.tipo === TipoMensajeTicket.RESPUESTA_CLIENTE;
  }
  return false; // entidadTipo='ot': nunca pertenece a un ticket
}

export async function abrirAdjuntoPortal(ticketId: string, adjuntoId: string): Promise<{ adjunto: Adjunto; stream: Readable }> {
  const adjunto = await AppDataSource.getRepository(Adjunto).findOne({ where: { id: adjuntoId } });
  if (!adjunto || !(await perteneceAlTicket(adjunto, ticketId))) throw NO_ENCONTRADO();

  // El resto (estado limpio/streaming) lo resuelve el mismo código que usa el panel interno.
  return abrirAdjunto(adjuntoId);
}
