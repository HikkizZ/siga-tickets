import { z } from "zod";
import { EntidadEvento } from "../entities/enums.js";
import type { ManagerTransaccional } from "./folio.service.js";

const id = z.string().uuid();
const estado = z.string().min(1).max(20);

// Payload por tipo de evento de OT. Guarda ids y valores de negocio, no copias de datos personales.
// `.strict()`: un campo de más es un bug del servicio y debe fallar antes de escribir.
export const eventoOtSchema = z.discriminatedUnion("tipo", [
  // origenTicketId/origenTicketNumero (Fase 3): solo presentes cuando la OT nace de
  // POST /tickets/:id/convertir-a-ot, para poder componer "creada desde TK-000X por [actor]".
  z
    .object({
      tipo: z.literal("creado"),
      numero: z.string(),
      responsableId: id,
      clienteId: id.nullable(),
      esInterna: z.boolean(),
      origenTicketId: id.optional(),
      origenTicketNumero: z.string().optional(),
    })
    .strict(),
  z.object({ tipo: z.literal("estado_cambiado"), de: estado, a: estado }).strict(),
  z.object({ tipo: z.literal("prioridad_cambiada"), de: estado, a: estado }).strict(),
  z.object({ tipo: z.literal("derivado"), de: id.nullable(), a: id, motivo: z.string().min(1), mantuvoComoColaborador: z.boolean() }).strict(),
  z.object({ tipo: z.literal("comentario"), comentarioId: id, visibleCliente: z.boolean() }).strict(),
  z.object({ tipo: z.literal("horas_registradas"), horaId: id, usuarioId: id, fecha: z.string(), horas: z.number() }).strict(),
  z.object({ tipo: z.literal("horas_eliminadas"), horaId: id, usuarioId: id, horas: z.number() }).strict(),
  z.object({ tipo: z.literal("colaborador_agregado"), usuarioId: id }).strict(),
  z.object({ tipo: z.literal("colaborador_quitado"), usuarioId: id }).strict(),
  z.object({ tipo: z.literal("etapa_creada"), etapaId: id }).strict(),
  z.object({ tipo: z.literal("etapa_editada"), etapaId: id, campos: z.array(z.string()) }).strict(),
  z.object({ tipo: z.literal("etapa_eliminada"), etapaId: id }).strict(),
  z.object({ tipo: z.literal("adjunto_agregado"), adjuntoId: id, mime: z.string(), tamanoBytes: z.number().int() }).strict(),
  z.object({ tipo: z.literal("ot_editada"), campos: z.array(z.string()).min(1) }).strict(),
  // Fase 2: la OT se entera de que una cotización nació, se vinculó o cambió de estado; el
  // detalle de la cotización se lee aparte con eventoCotizacionSchema. `cotizacionId` es la
  // referencia que GET /cotizaciones/:id usa para reconstruir su propio timeline (ver más abajo).
  z.object({ tipo: z.literal("cotizacion_creada"), cotizacionId: id, numero: z.string() }).strict(),
  z.object({ tipo: z.literal("cotizacion_vinculada"), cotizacionId: id, numero: z.string() }).strict(),
  z.object({ tipo: z.literal("cotizacion_estado_cambiado"), cotizacionId: id, de: estado, a: estado }).strict(),
]);

export type EventoOt = z.input<typeof eventoOtSchema>;

// Payload por tipo de evento propio de una cotización (entidad_tipo='cotizacion').
export const eventoCotizacionSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("cotizacion_editada"),
    campos: z.array(z.string()).min(1),
    montoClpAntes: z.number().int(),
    montoClpDespues: z.number().int(),
  }).strict(),
  z.object({ tipo: z.literal("cotizacion_estado_cambiado"), de: estado, a: estado }).strict(),
]);

export type EventoCotizacion = z.input<typeof eventoCotizacionSchema>;

// Inserción cruda compartida por ambas entidades auditables: evento tiene un trigger y TypeORM
// añadiría OUTPUT (error 334 de SQL Server con triggers). Debe llamarse en la MISMA transacción
// que el cambio auditado.
async function insertarEvento(
  manager: ManagerTransaccional,
  entidadTipo: EntidadEvento,
  entidadId: string,
  actorId: string,
  tipo: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await manager.query(
    `INSERT INTO evento (entidad_tipo, entidad_id, tipo, actor_id, payload) VALUES (@0, @1, @2, @3, @4)`,
    [entidadTipo, entidadId, tipo, actorId, JSON.stringify(payload)],
  );
}

export async function registrarEventoOt(
  manager: ManagerTransaccional,
  otId: string,
  actorId: string,
  evento: EventoOt,
): Promise<void> {
  const { tipo, ...payload } = eventoOtSchema.parse(evento);
  await insertarEvento(manager, EntidadEvento.OT, otId, actorId, tipo, payload);
}

// Timeline propio de una cotización (Fase 2). GET /cotizaciones/:id la combina con los eventos de
// la OT cuyo payload la referencia (`cotizacionId`) — ver cotizacion.service.ts.
export async function registrarEventoCotizacion(
  manager: ManagerTransaccional,
  cotizacionId: string,
  actorId: string,
  evento: EventoCotizacion,
): Promise<void> {
  const { tipo, ...payload } = eventoCotizacionSchema.parse(evento);
  await insertarEvento(manager, EntidadEvento.COTIZACION, cotizacionId, actorId, tipo, payload);
}

// Payload por tipo de evento de ticket (Fase 3). Sin mantuvoComoColaborador (el ticket no tiene
// colaboradores, ver ticket.policy.ts); con un tipo 'tomado' que OT no tiene (un ticket nace sin
// responsable, ver decisión 0.4 del diseño).
export const eventoTicketSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("creado"), numero: z.string(), canal: z.string(), recepcionadoPorId: id, clienteId: id.nullable() }).strict(),
  z.object({ tipo: z.literal("estado_cambiado"), de: estado, a: estado }).strict(),
  z.object({ tipo: z.literal("prioridad_cambiada"), de: estado, a: estado }).strict(),
  z.object({ tipo: z.literal("ticket_editado"), campos: z.array(z.string()).min(1) }).strict(),
  z.object({ tipo: z.literal("tomado"), usuarioId: id }).strict(),
  z.object({ tipo: z.literal("derivado"), de: id.nullable(), a: id, motivo: z.string().min(1) }).strict(),
  z.object({ tipo: z.literal("respuesta_cliente"), mensajeId: id }).strict(),
  z.object({ tipo: z.literal("nota_interna"), mensajeId: id }).strict(),
  // Fase 5: mensaje del cliente desde el portal público (tipo='cliente' en mensaje_ticket, sin
  // equivalente interno: 'respuesta_cliente'/'nota_interna' los crea el panel, este solo el portal).
  z.object({ tipo: z.literal("mensaje_cliente"), mensajeId: id }).strict(),
  z.object({ tipo: z.literal("adjunto_agregado"), adjuntoId: id, mime: z.string(), tamanoBytes: z.number().int() }).strict(),
  // esOrigen distingue el vínculo creado por convertir-a-ot (true) de uno manual con una OT
  // existente vía POST /tickets/:id/ots (false).
  z.object({ tipo: z.literal("vinculado_ot"), otId: id, otNumero: z.string(), esOrigen: z.boolean() }).strict(),
  z.object({ tipo: z.literal("ot_desvinculada"), otId: id, otNumero: z.string() }).strict(),
]);

export type EventoTicket = z.input<typeof eventoTicketSchema>;

export async function registrarEventoTicket(
  manager: ManagerTransaccional,
  ticketId: string,
  actorId: string,
  evento: EventoTicket,
): Promise<void> {
  const { tipo, ...payload } = eventoTicketSchema.parse(evento);
  await insertarEvento(manager, EntidadEvento.TICKET, ticketId, actorId, tipo, payload);
}
