import { Ticket } from "../entities/Ticket.js";
import { EstadoTicket } from "../entities/enums.js";
import { AppError } from "../errors/AppError.js";
import type { ContextoTicket } from "../policies/ticket.policy.js";
import { registrarEventoTicket } from "./evento.service.js";
import type { ManagerTransaccional } from "./folio.service.js";
import { ahoraDb, type UsuarioActor } from "./ot.common.js";
import { cerrarPausaYCorrerVencimientos } from "./sla.pausa.service.js";

export function ticketNoEncontrado(): AppError {
  return new AppError(404, "TICKET_NO_ENCONTRADO", "Ticket no encontrado");
}

// Toma el lock de la fila del ticket (UPDLOCK) hasta el fin de la transacción: mismo mecanismo
// que bloquearOt (ot.common.ts) — serializa las operaciones que modifican el ticket.
export async function bloquearTicket(manager: ManagerTransaccional, id: string): Promise<Ticket> {
  const t = await manager.findOne(Ticket, { where: { id }, lock: { mode: "pessimistic_write" } });
  if (!t) throw ticketNoEncontrado();
  return t;
}

// Sin colaborador (a diferencia de contextoOt): solo importa si el actor es el responsable actual.
export function contextoTicket(ticket: Ticket, actor: UsuarioActor): ContextoTicket {
  return { usuario: actor, responsableActualId: ticket.responsableActualId };
}

// "Reabrir ticket + cerrar pausa de SLA cuando responde el cliente" (Fase 5, punto 7 del encargo;
// reutilizada tal cual por la ingesta de correo de la Fase 6, ver
// services/correoIngerido.service.ts). Factorizada desde services/portal.mensaje.service.ts, que
// tenía esta misma lógica inline (única llamadora hasta ahora). Si el ticket estaba
// esperando_cliente o resuelto: cierra la pausa de SLA activa (solo si venía de esperando_cliente)
// y pasa a abierto, con su propio evento estado_cambiado. Si estaba cerrado (o cualquier otro
// estado), no hace nada: "cerrado" no se reabre automáticamente (decisión del staff). Muta
// `ticket` en memoria y hace su propio m.save(); el llamador no debe volver a guardarlo.
export async function reabrirTicketSiCorresponde(manager: ManagerTransaccional, ticket: Ticket, actorId: string): Promise<void> {
  if (ticket.estado !== EstadoTicket.ESPERANDO_CLIENTE && ticket.estado !== EstadoTicket.RESUELTO) return;

  const anterior = ticket.estado;
  const ahora = await ahoraDb(manager);
  if (anterior === EstadoTicket.ESPERANDO_CLIENTE) {
    await cerrarPausaYCorrerVencimientos(manager, ticket, ahora);
  }
  ticket.estado = EstadoTicket.ABIERTO;
  await manager.save(Ticket, ticket);
  await registrarEventoTicket(manager, ticket.id, actorId, { tipo: "estado_cambiado", de: anterior, a: EstadoTicket.ABIERTO });
}
