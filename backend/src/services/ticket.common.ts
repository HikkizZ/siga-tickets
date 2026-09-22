import { Ticket } from "../entities/Ticket.js";
import { AppError } from "../errors/AppError.js";
import type { ContextoTicket } from "../policies/ticket.policy.js";
import type { ManagerTransaccional } from "./folio.service.js";
import type { UsuarioActor } from "./ot.common.js";

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
