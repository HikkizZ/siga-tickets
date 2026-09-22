import { DateTime } from "luxon";
import { SlaConfig } from "../entities/SlaConfig.js";
import type { Prioridad } from "../entities/enums.js";
import { horasHabilesEntre, sumarHorasHabiles, ZONA_HORARIA_SLA, type FilaCalendario } from "../sla/horasHabiles.js";
import type { ManagerTransaccional } from "./folio.service.js";

// Carga y cálculo de vencimientos de SLA (Fase 4). Todo lo que toca la BD (calendario_laboral,
// feriado, sla_config) vive aquí; horasHabiles.ts se mantiene puro. Se usa desde:
//   - ot.service.ts / ticket.service.ts (crear, cambiar prioridad)
//   - ticket.conversion.service.ts (la OT nacida de una conversión tiene su propio reloj)
//   - sla.config.service.ts (recálculo en lote al editar sla_config)
//   - sla.pausa.service.ts (correr el vencimiento al cerrar una pausa)
//   - jobs/slaJob.ts (horas hábiles restantes hasta el vencimiento)

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

export async function obtenerSlaConfigDe(manager: ManagerTransaccional, prioridad: Prioridad): Promise<SlaConfig> {
  const fila = await manager.findOne(SlaConfig, { where: { prioridad } });
  // No debería pasar: la migración siembra las 3 filas (alta/media/baja) y prioridad es un enum
  // cerrado validado por Zod antes de llegar aquí.
  if (!fila) throw new Error(`sla_config no tiene fila para la prioridad ${prioridad}`);
  return fila;
}

// horasResolucion/horasPrimeraRespuesta ya están expresadas EN horas hábiles cuando
// usar_horas_habiles=true (el caso normal); si algún día se apaga, se cuentan como horas de reloj
// corridas desde fechaIngreso (campo existente en sla_config, editable por PUT /sla/config, así
// que se honra aunque el encargo no lo pruebe explícitamente).
function calcularVencimiento(fechaIngreso: Date, horas: number, cfg: SlaConfig, cal: CalendarioYFeriados): Date {
  if (!cfg.usarHorasHabiles) {
    return DateTime.fromJSDate(fechaIngreso, { zone: "utc" }).plus({ hours: horas }).toJSDate();
  }
  return sumarHorasHabiles(aDateTime(fechaIngreso), horas, cal.calendario, cal.feriados, ZONA_HORARIA_SLA).toJSDate();
}

export async function calcularVencimientoOt(manager: ManagerTransaccional, prioridad: Prioridad, fechaIngreso: Date): Promise<Date> {
  const cfg = await obtenerSlaConfigDe(manager, prioridad);
  const cal = await cargarCalendarioYFeriados(manager);
  return calcularVencimiento(fechaIngreso, cfg.horasResolucion, cfg, cal);
}

export async function calcularVencimientosTicket(
  manager: ManagerTransaccional,
  prioridad: Prioridad,
  fechaIngreso: Date,
): Promise<{ slaResolucionVenceEn: Date; slaRespuestaVenceEn: Date }> {
  const cfg = await obtenerSlaConfigDe(manager, prioridad);
  const cal = await cargarCalendarioYFeriados(manager);
  return {
    slaResolucionVenceEn: calcularVencimiento(fechaIngreso, cfg.horasResolucion, cfg, cal),
    slaRespuestaVenceEn: calcularVencimiento(fechaIngreso, cfg.horasPrimeraRespuesta, cfg, cal),
  };
}

// PUT /sla/config: recalcula en lote las OT y tickets ABIERTOS de una prioridad, desde su propia
// fecha_ingreso (no desde ahora). Volumen bajo (~8 usuarios): un bucle de UPDATE dentro de la
// misma transacción del cambio de config es aceptable, sin colas.
export async function recalcularAbiertosPorPrioridad(manager: ManagerTransaccional, prioridad: Prioridad, cfg: SlaConfig): Promise<void> {
  const cal = await cargarCalendarioYFeriados(manager);

  const ots: Array<{ id: string; fecha_ingreso: Date }> = await manager.query(
    `SELECT id, fecha_ingreso FROM ot WHERE prioridad = @0 AND estado NOT IN ('terminado','facturado')`,
    [prioridad],
  );
  for (const ot of ots) {
    const vence = calcularVencimiento(ot.fecha_ingreso, cfg.horasResolucion, cfg, cal);
    await manager.query(`UPDATE ot SET sla_resolucion_vence_en = @0 WHERE id = @1`, [vence.toISOString(), ot.id]);
  }

  const tickets: Array<{ id: string; fecha_ingreso: Date }> = await manager.query(
    `SELECT id, fecha_ingreso FROM ticket WHERE prioridad = @0 AND estado NOT IN ('resuelto','cerrado')`,
    [prioridad],
  );
  for (const t of tickets) {
    const resolucion = calcularVencimiento(t.fecha_ingreso, cfg.horasResolucion, cfg, cal);
    const respuesta = calcularVencimiento(t.fecha_ingreso, cfg.horasPrimeraRespuesta, cfg, cal);
    await manager.query(`UPDATE ticket SET sla_resolucion_vence_en = @0, sla_respuesta_vence_en = @1 WHERE id = @2`, [
      resolucion.toISOString(),
      respuesta.toISOString(),
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
