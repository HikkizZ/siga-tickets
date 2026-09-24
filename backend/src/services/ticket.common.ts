import { EstadoTicket } from "../entities/EstadoTicket.js";
import { Ticket } from "../entities/Ticket.js";
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
// tenía esta misma lógica inline (única llamadora hasta ahora).
//
// Fase C: el chequeo por valor literal ("esperando_cliente" o "resuelto") se reemplaza por los
// flags de la fila estado_ticket actual del ticket: reabre si el estado actual tiene
// esPausaSla=true (equivalente a "esperando_cliente") O marcaResueltoEn=true (equivalente al
// estado real "resuelto", no cualquier terminal — "cerrado" tiene esTerminal pero no
// marcaResueltoEn=true en la semilla, así que queda fuera, igual que antes). Si tenía esPausaSla,
// cierra la pausa igual que antes. El destino siempre es la fila con esDestinoReapertura=true. Si
// estaba en cualquier otro estado (incluido el que marca cerrado), no hace nada. Muta `ticket` en
// memoria y hace su propio m.save(); el llamador no debe volver a guardarlo.
export async function reabrirTicketSiCorresponde(manager: ManagerTransaccional, ticket: Ticket, actorId: string): Promise<void> {
  const estadoActual = await manager.findOneByOrFail(EstadoTicket, { id: ticket.estadoId });
  if (!estadoActual.esPausaSla && !estadoActual.marcaResueltoEn) return;

  const destino = await manager.findOneBy(EstadoTicket, { esDestinoReapertura: true });
  if (!destino) throw new Error("No hay ningún estado_ticket marcado como esDestinoReapertura=true");

  const ahora = await ahoraDb(manager);
  if (estadoActual.esPausaSla) {
    await cerrarPausaYCorrerVencimientos(manager, ticket, ahora);
  }
  ticket.estadoId = destino.id;
  await manager.save(Ticket, ticket);
  // Payload legible por nombre (no el uuid), mismo criterio que antes con el valor del enum.
  await registrarEventoTicket(manager, ticket.id, actorId, { tipo: "estado_cambiado", de: estadoActual.nombre, a: destino.nombre });
}
