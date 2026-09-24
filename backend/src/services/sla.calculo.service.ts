import { DateTime } from "luxon";
import { Prioridad } from "../entities/Prioridad.js";
import { horasHabilesEntre, sumarHorasHabiles, ZONA_HORARIA_SLA, type FilaCalendario } from "../sla/horasHabiles.js";
import type { ManagerTransaccional } from "./folio.service.js";

// Carga y cálculo de vencimientos de SLA (Fase 4; consolidado en la Fase C). Todo lo que toca la
// BD (calendario_laboral, feriado, prioridad + su plan_sla) vive aquí; horasHabiles.ts se mantiene
// puro. Se usa desde:
//   - ot.service.ts / ticket.service.ts (crear, cambiar prioridad)
//   - ticket.conversion.service.ts (la OT nacida de una conversión tiene su propio reloj)
//   - slaPlan.service.ts (recálculo en lote al editar un plan SLA o desvincular uno al borrarlo)
//   - sla.pausa.service.ts (correr el vencimiento al cerrar una pausa)
//   - jobs/slaJob.ts (horas hábiles restantes hasta el vencimiento)
//
// Fase C: sla_config (3 filas fijas por prioridad) se retira. El SLA real ahora se calcula desde
// Prioridad.planSla (Fase B2, catálogo con nombre propio, antes sin conexión real). Una prioridad
// sin plan asignado (planSlaId NULL) no tiene SLA: los vencimientos quedan `null`, no se lanza error.

export interface CalendarioYFeriados {
  calendario: FilaCalendario[];
  feriados: Set<string>;
}

// CONVERT a varchar evita depender de cómo tedious tipe TIME/DATE: siempre llegan como
// "HH:MM:SS" / "YYYY-MM-DD", sin importar la versión del driver.
export async function cargarCalendarioYFeriados(manager: ManagerTransaccional): Promise<CalendarioYFeriados> {
  const filasCalendario: Array<{ dia_semana: number; hora_inicio: string; hora_fin: string }> = await manager.query(
    `SELECT dia_semana, CONVERT(varchar(8), hora_inicio, 108) AS hora_inicio, CONVERT(varchar(8), hora_fin, 108) AS hora_fin
     FROM calendario_laboral`,
  );
  const filasFeriado: Array<{ fecha: string }> = await manager.query(`SELECT CONVERT(varchar(10), fecha, 23) AS fecha FROM feriado`);
  return {
    calendario: filasCalendario.map((f) => ({ diaSemana: f.dia_semana, horaInicio: f.hora_inicio, horaFin: f.hora_fin })),
    feriados: new Set(filasFeriado.map((f) => f.fecha)),
  };
}

function aDateTime(d: Date): DateTime {
  return DateTime.fromJSDate(d, { zone: "utc" });
}

// Fila mínima necesaria para calcular vencimientos: la prioridad con su plan (o null si no tiene).
interface PrioridadConPlan {
  planSla: {
    horasResolucion: number;
    horasPrimeraRespuesta: number;
    usarHorasHabiles: boolean;
  } | null;
}

async function obtenerPrioridadConPlan(manager: ManagerTransaccional, prioridadId: string): Promise<PrioridadConPlan> {
  const fila = await manager.findOne(Prioridad, { where: { id: prioridadId }, relations: { planSla: true } });
  // No debería pasar: prioridadId ya se valida (exigirPrioridadActiva/existencia) antes de llegar
  // aquí en todos los call sites.
  if (!fila) throw new Error(`prioridad no encontrada: ${prioridadId}`);
  return fila;
}

// horasResolucion/horasPrimeraRespuesta ya están expresadas EN horas hábiles cuando
// usar_horas_habiles=true (el caso normal); si algún día se apaga, se cuentan como horas de reloj
// corridas desde fechaIngreso.
function calcularVencimiento(fechaIngreso: Date, horas: number, usarHorasHabiles: boolean, cal: CalendarioYFeriados): Date {
  if (!usarHorasHabiles) {
    return DateTime.fromJSDate(fechaIngreso, { zone: "utc" }).plus({ hours: horas }).toJSDate();
  }
  return sumarHorasHabiles(aDateTime(fechaIngreso), horas, cal.calendario, cal.feriados, ZONA_HORARIA_SLA).toJSDate();
}

export async function calcularVencimientoOt(manager: ManagerTransaccional, prioridadId: string, fechaIngreso: Date): Promise<Date | null> {
  const { planSla } = await obtenerPrioridadConPlan(manager, prioridadId);
  if (!planSla) return null;
  const cal = await cargarCalendarioYFeriados(manager);
  return calcularVencimiento(fechaIngreso, planSla.horasResolucion, planSla.usarHorasHabiles, cal);
}

export async function calcularVencimientosTicket(
  manager: ManagerTransaccional,
  prioridadId: string,
  fechaIngreso: Date,
): Promise<{ slaResolucionVenceEn: Date | null; slaRespuestaVenceEn: Date | null }> {
  const { planSla } = await obtenerPrioridadConPlan(manager, prioridadId);
  if (!planSla) return { slaResolucionVenceEn: null, slaRespuestaVenceEn: null };
  const cal = await cargarCalendarioYFeriados(manager);
  return {
    slaResolucionVenceEn: calcularVencimiento(fechaIngreso, planSla.horasResolucion, planSla.usarHorasHabiles, cal),
    slaRespuestaVenceEn: calcularVencimiento(fechaIngreso, planSla.horasPrimeraRespuesta, planSla.usarHorasHabiles, cal),
  };
}

// Recalcula en lote las OT y tickets ABIERTOS de una prioridad, desde su propia fecha_ingreso (no
// desde ahora). `plan` es el PlanSla vigente para esa prioridad al momento de llamar (null = la
// prioridad se quedó sin plan: limpia los vencimientos de lo abierto). Volumen bajo (~8 usuarios):
// un bucle de UPDATE dentro de la misma transacción del cambio es aceptable, sin colas.
//
// "Abierto" en ticket ahora se expresa vía estado_ticket.es_terminal (antes `estado NOT IN
// ('resuelto','cerrado')` literal); en ot sigue igual (EstadoOt no cambia en esta fase).
export async function recalcularAbiertosPorPrioridad(
  manager: ManagerTransaccional,
  prioridadId: string,
  plan: { horasResolucion: number; horasPrimeraRespuesta: number; usarHorasHabiles: boolean } | null,
): Promise<void> {
  const cal = plan ? await cargarCalendarioYFeriados(manager) : null;

  const ots: Array<{ id: string; fecha_ingreso: Date }> = await manager.query(
    `SELECT id, fecha_ingreso FROM ot WHERE prioridad_id = @0 AND estado NOT IN ('terminado','facturado')`,
    [prioridadId],
  );
  for (const ot of ots) {
    const vence = plan && cal ? calcularVencimiento(ot.fecha_ingreso, plan.horasResolucion, plan.usarHorasHabiles, cal) : null;
    await manager.query(`UPDATE ot SET sla_resolucion_vence_en = @0 WHERE id = @1`, [vence ? vence.toISOString() : null, ot.id]);
  }

  const tickets: Array<{ id: string; fecha_ingreso: Date }> = await manager.query(
    `SELECT t.id, t.fecha_ingreso FROM ticket t
     JOIN estado_ticket e ON e.id = t.estado_id
     WHERE t.prioridad_id = @0 AND e.es_terminal = 0`,
    [prioridadId],
  );
  for (const t of tickets) {
    const resolucion = plan && cal ? calcularVencimiento(t.fecha_ingreso, plan.horasResolucion, plan.usarHorasHabiles, cal) : null;
    const respuesta = plan && cal ? calcularVencimiento(t.fecha_ingreso, plan.horasPrimeraRespuesta, plan.usarHorasHabiles, cal) : null;
    await manager.query(`UPDATE ticket SET sla_resolucion_vence_en = @0, sla_respuesta_vence_en = @1 WHERE id = @2`, [
      resolucion ? resolucion.toISOString() : null,
      respuesta ? respuesta.toISOString() : null,
      t.id,
    ]);
  }
}

// Cierre de una pausa de SLA (solo tickets): corre `vencimiento` hacia adelante exactamente los
// minutos hábiles que duró la pausa [pausaDesde, pausaHasta] (no un recálculo desde cero).
export function correrVencimientoPorPausa(vencimiento: Date, pausaDesde: Date, pausaHasta: Date, cal: CalendarioYFeriados): Date {
  const horasPausa = horasHabilesEntre(aDateTime(pausaDesde), aDateTime(pausaHasta), cal.calendario, cal.feriados, ZONA_HORARIA_SLA);
  if (horasPausa <= 0) return vencimiento;
  return sumarHorasHabiles(aDateTime(vencimiento), horasPausa, cal.calendario, cal.feriados, ZONA_HORARIA_SLA).toJSDate();
}

// Job (evaluarSla): en_plazo -> por_vencer cuando quedan menos de umbralPorVencer del plazo total
// en horas hábiles; vencida al pasar el vencimiento. `ahora >= vencimiento` se compara por
// instante (no hace falta convertir a horas hábiles: si ya pasó, pasó).
export function calcularEstadoSla(
  ahora: Date,
  vencimiento: Date,
  horasPlazo: number,
  umbralPorVencer: number,
  cal: CalendarioYFeriados,
): "en_plazo" | "por_vencer" | "vencida" {
  if (ahora.getTime() >= vencimiento.getTime()) return "vencida";
  const restantes = horasHabilesEntre(aDateTime(ahora), aDateTime(vencimiento), cal.calendario, cal.feriados, ZONA_HORARIA_SLA);
  return restantes <= horasPlazo * umbralPorVencer ? "por_vencer" : "en_plazo";
}
