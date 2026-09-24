import { IsNull } from "typeorm";
import { Prioridad } from "../entities/Prioridad.js";
import { SlaPausa } from "../entities/SlaPausa.js";
import { Ticket } from "../entities/Ticket.js";
import { EntidadAsignable } from "../entities/enums.js";
import { cargarCalendarioYFeriados, correrVencimientoPorPausa } from "./sla.calculo.service.js";
import type { ManagerTransaccional } from "./folio.service.js";

// Pausa del SLA en POST /tickets/:id/estado (Fase 4, sección "Pausa del SLA" del encargo; el
// estado que dispara la pausa es el que tenga esPausaSla=true en estado_ticket, ver ticket.service.ts
// ::cambiarEstadoTicket). Solo tickets: la OT no tiene un estado equivalente. Debe llamarse dentro
// de la MISMA transacción que ya cambia el estado del ticket.

// Al ENTRAR al estado de pausa: abre sla_pausa (desde=ahora) solo si la prioridad tiene un plan SLA
// asignado con pausarEnEsperaCliente=true, y fija ticket.slaPausadoDesde. Sin plan, no hay SLA que
// pausar. Muta `ticket` en memoria; el llamador es quien hace el m.save(Ticket, ticket) final.
export async function abrirPausaSiCorresponde(manager: ManagerTransaccional, ticket: Ticket, ahora: Date): Promise<void> {
  const prioridad = await manager.findOne(Prioridad, { where: { id: ticket.prioridadId }, relations: { planSla: true } });
  if (!prioridad?.planSla?.pausarEnEsperaCliente) return;
  await manager.insert(SlaPausa, {
    entidadTipo: EntidadAsignable.TICKET,
    entidadId: ticket.id,
    desde: ahora,
  });
  ticket.slaPausadoDesde = ahora;
}

// Al SALIR de esperando_cliente: cierra la pausa abierta (si la hay: puede no haberla si
// pausarEnEsperaCliente estaba en false al entrar), limpia slaPausadoDesde y corre ambos
// vencimientos (resolución, y respuesta si primera_respuesta_en sigue NULL) hacia adelante por
// las horas hábiles que duró la pausa. Muta `ticket` en memoria; el llamador guarda.
export async function cerrarPausaYCorrerVencimientos(manager: ManagerTransaccional, ticket: Ticket, ahora: Date): Promise<void> {
  const abierta = await manager.findOne(SlaPausa, {
    where: { entidadTipo: EntidadAsignable.TICKET, entidadId: ticket.id, hasta: IsNull() },
  });
  ticket.slaPausadoDesde = null;
  if (!abierta) return; // defensivo: no había pausa abierta (pausarEnEsperaCliente estaba en false)

  abierta.hasta = ahora;
  await manager.save(SlaPausa, abierta);

  const cal = await cargarCalendarioYFeriados(manager);
  if (ticket.slaResolucionVenceEn) {
    ticket.slaResolucionVenceEn = correrVencimientoPorPausa(ticket.slaResolucionVenceEn, abierta.desde, ahora, cal);
  }
  if (ticket.primeraRespuestaEn === null && ticket.slaRespuestaVenceEn) {
    ticket.slaRespuestaVenceEn = correrVencimientoPorPausa(ticket.slaRespuestaVenceEn, abierta.desde, ahora, cal);
  }
}
