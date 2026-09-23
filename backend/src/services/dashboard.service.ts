import { AppDataSource } from "../config/dataSource.js";
import { EstadoCotizacion, EstadoOt } from "../entities/enums.js";
import type { FiltrosDashboard } from "../validations/dashboard.validation.js";

// Fase 7: dashboard por consulta directa (sin materializar nada, apropiado para ~8 usuarios). Cada
// campo documenta si respeta desde/hasta o si es una "foto" del estado actual (ver docs/api.md).
//
// Filtro de fecha: si solo viene uno de los dos límites, se aplica solo ese (no se inventa el otro
// lado del rango); sin ninguno, sin filtro de fecha (histórico completo). Igual que ot/ticket
// listado, el día se cuenta en hora de Chile sobre columnas datetimeoffset (AT TIME ZONE); las
// columnas `date` (cotizacion.fecha) ya son un día de calendario y no necesitan conversión.
function condicionesFecha(columnaDatetimeoffset: string, filtros: FiltrosDashboard, params: unknown[]): string[] {
  const dia = `CAST(${columnaDatetimeoffset} AT TIME ZONE 'Pacific SA Standard Time' AS date)`;
  const w: string[] = [];
  if (filtros.desde) {
    params.push(filtros.desde);
    w.push(`${dia} >= @${params.length - 1}`);
  }
  if (filtros.hasta) {
    params.push(filtros.hasta);
    w.push(`${dia} <= @${params.length - 1}`);
  }
  return w;
}

function condicionesFechaDate(columnaDate: string, filtros: FiltrosDashboard, params: unknown[]): string[] {
  const w: string[] = [];
  if (filtros.desde) {
    params.push(filtros.desde);
    w.push(`${columnaDate} >= @${params.length - 1}`);
  }
  if (filtros.hasta) {
    params.push(filtros.hasta);
    w.push(`${columnaDate} <= @${params.length - 1}`);
  }
  return w;
}

// Redondea a 2 decimales (mismo motivo que ot.service.ts::sumarHoras: evita ruido de coma flotante
// en un promedio que después se serializa a JSON).
const redondear2 = (n: number): number => Math.round(n * 100) / 100;

// ------------------------------------------------------------------ 1-2: OT, foto actual

async function contarOtActivas(): Promise<number> {
  const [{ total }] = (await AppDataSource.query(
    `SELECT COUNT(*) AS total FROM ot WHERE estado NOT IN ('terminado','facturado')`,
  )) as Array<{ total: number }>;
  return Number(total);
}

async function contarOtConSlaVencido(): Promise<number> {
  const [{ total }] = (await AppDataSource.query(
    `SELECT COUNT(*) AS total FROM ot WHERE sla_estado = 'vencida' AND estado NOT IN ('terminado','facturado')`,
  )) as Array<{ total: number }>;
  return Number(total);
}

// ------------------------------------------------------------------ 3: montoCotizacionesAprobadas (filtrado)

async function calcularMontoCotizacionesAprobadas(filtros: FiltrosDashboard): Promise<number> {
  const params: unknown[] = [];
  const w = ["estado = 'aprobada'", ...condicionesFecha("aprobada_en", filtros, params)];
  const [{ total }] = (await AppDataSource.query(
    `SELECT COALESCE(SUM(monto_clp), 0) AS total FROM cotizacion WHERE ${w.join(" AND ")}`,
    params,
  )) as Array<{ total: string }>;
  return Number(total);
}

// ------------------------------------------------------------------ 4: tiempoMedioResolucionDias (filtrado)

async function calcularTiempoMedioResolucionDias(filtros: FiltrosDashboard): Promise<number | null> {
  const params: unknown[] = [];
  const w = ["terminado_en IS NOT NULL", ...condicionesFecha("terminado_en", filtros, params)];
  const [{ promedio }] = (await AppDataSource.query(
    `SELECT AVG(CAST(DATEDIFF(hour, fecha_ingreso, terminado_en) AS float) / 24.0) AS promedio
     FROM ot WHERE ${w.join(" AND ")}`,
    params,
  )) as Array<{ promedio: number | null }>;
  return promedio === null ? null : redondear2(Number(promedio));
}

// ------------------------------------------------------------------ 5: otPorEstado (foto actual, incluye ceros)

const ESTADOS_OT_ORDEN: EstadoOt[] = [
  EstadoOt.INGRESADO,
  EstadoOt.EN_COTIZACION,
  EstadoOt.APROBADO,
  EstadoOt.EN_EJECUCION,
  EstadoOt.TERMINADO,
  EstadoOt.FACTURADO,
];

async function calcularOtPorEstado(): Promise<Array<{ estado: EstadoOt; cantidad: number }>> {
  const filas = (await AppDataSource.query(`SELECT estado, COUNT(*) AS cantidad FROM ot GROUP BY estado`)) as Array<{
    estado: EstadoOt;
    cantidad: number;
  }>;
  const mapa = new Map(filas.map((f) => [f.estado, Number(f.cantidad)]));
  return ESTADOS_OT_ORDEN.map((estado) => ({ estado, cantidad: mapa.get(estado) ?? 0 }));
}

// ------------------------------------------------------------------ 6: otPorCliente (foto actual, top 10)

async function calcularOtPorCliente(): Promise<Array<{ clienteId: string; clienteNombre: string; cantidad: number }>> {
  const filas = (await AppDataSource.query(`
    SELECT TOP 10 c.id, c.nombre, COUNT(*) AS cantidad
    FROM ot o JOIN cliente c ON c.id = o.cliente_id
    WHERE o.estado NOT IN ('terminado','facturado')
    GROUP BY c.id, c.nombre
    ORDER BY COUNT(*) DESC, c.nombre ASC
  `)) as Array<{ id: string; nombre: string; cantidad: number }>;
  return filas.map((f) => ({ clienteId: f.id.toLowerCase(), clienteNombre: f.nombre, cantidad: Number(f.cantidad) }));
}

// ------------------------------------------------------------------ 7: otPorResponsable (foto actual, sin límite)

async function calcularOtPorResponsable(): Promise<Array<{ usuarioId: string; usuarioNombre: string; cantidad: number }>> {
  const filas = (await AppDataSource.query(`
    SELECT u.id, u.nombre, COUNT(*) AS cantidad
    FROM ot o JOIN usuario u ON u.id = o.responsable_actual_id
    WHERE o.estado NOT IN ('terminado','facturado')
    GROUP BY u.id, u.nombre
    ORDER BY COUNT(*) DESC, u.nombre ASC
  `)) as Array<{ id: string; nombre: string; cantidad: number }>;
  return filas.map((f) => ({ usuarioId: f.id.toLowerCase(), usuarioNombre: f.nombre, cantidad: Number(f.cantidad) }));
}

// ------------------------------------------------------------------ 8: cotizacionesPorEstado (filtrado, incluye ceros)

const ESTADOS_COT_ORDEN: EstadoCotizacion[] = [
  EstadoCotizacion.BORRADOR,
  EstadoCotizacion.ENVIADA,
  EstadoCotizacion.APROBADA,
  EstadoCotizacion.RECHAZADA,
];

async function calcularCotizacionesPorEstado(
  filtros: FiltrosDashboard,
): Promise<Array<{ estado: EstadoCotizacion; cantidad: number; montoClp: number }>> {
  const params: unknown[] = [];
  const w = condicionesFechaDate("fecha", filtros, params);
  const where = w.length ? `WHERE ${w.join(" AND ")}` : "";
  const filas = (await AppDataSource.query(
    `SELECT estado, COUNT(*) AS cantidad, COALESCE(SUM(monto_clp), 0) AS monto FROM cotizacion ${where} GROUP BY estado`,
    params,
  )) as Array<{ estado: EstadoCotizacion; cantidad: number; monto: string }>;
  const mapa = new Map(filas.map((f) => [f.estado, { cantidad: Number(f.cantidad), montoClp: Number(f.monto) }]));
  return ESTADOS_COT_ORDEN.map((estado) => {
    const v = mapa.get(estado);
    return { estado, cantidad: v?.cantidad ?? 0, montoClp: v?.montoClp ?? 0 };
  });
}

// ------------------------------------------------------------------ 9: ticketsSinResponderFueraDeSla (foto actual)

async function contarTicketsSinResponderFueraDeSla(): Promise<number> {
  const [{ total }] = (await AppDataSource.query(
    `SELECT COUNT(*) AS total FROM ticket WHERE primera_respuesta_en IS NULL AND sla_estado = 'vencida'`,
  )) as Array<{ total: number }>;
  return Number(total);
}

// ------------------------------------------------------------------ 10: tiempoMedioPrimeraRespuestaHoras (filtrado)

// En horas de RELOJ, no horas hábiles: es una métrica de reporte ("cuánto tardamos en promedio en
// contestar"), distinta del cálculo de cumplimiento de SLA (sla.calculo.service.ts), que sí cuenta
// en horas hábiles contra slaRespuestaVenceEn. Ambas miden algo distinto a propósito.
async function calcularTiempoMedioPrimeraRespuestaHoras(filtros: FiltrosDashboard): Promise<number | null> {
  const params: unknown[] = [];
  const w = ["primera_respuesta_en IS NOT NULL", ...condicionesFecha("primera_respuesta_en", filtros, params)];
  const [{ promedio }] = (await AppDataSource.query(
    `SELECT AVG(CAST(DATEDIFF(minute, fecha_ingreso, primera_respuesta_en) AS float) / 60.0) AS promedio
     FROM ticket WHERE ${w.join(" AND ")}`,
    params,
  )) as Array<{ promedio: number | null }>;
  return promedio === null ? null : redondear2(Number(promedio));
}

// ------------------------------------------------------------------

export interface DashboardDto {
  otActivas: number;
  otConSlaVencido: number;
  montoCotizacionesAprobadas: number;
  tiempoMedioResolucionDias: number | null;
  otPorEstado: Array<{ estado: EstadoOt; cantidad: number }>;
  otPorCliente: Array<{ clienteId: string; clienteNombre: string; cantidad: number }>;
  otPorResponsable: Array<{ usuarioId: string; usuarioNombre: string; cantidad: number }>;
  cotizacionesPorEstado: Array<{ estado: EstadoCotizacion; cantidad: number; montoClp: number }>;
  ticketsSinResponderFueraDeSla: number;
  tiempoMedioPrimeraRespuestaHoras: number | null;
}

export async function obtenerDashboard(filtros: FiltrosDashboard): Promise<DashboardDto> {
  const [
    otActivas,
    otConSlaVencido,
    montoCotizacionesAprobadas,
    tiempoMedioResolucionDias,
    otPorEstado,
    otPorCliente,
    otPorResponsable,
    cotizacionesPorEstado,
    ticketsSinResponderFueraDeSla,
    tiempoMedioPrimeraRespuestaHoras,
  ] = await Promise.all([
    contarOtActivas(),
    contarOtConSlaVencido(),
    calcularMontoCotizacionesAprobadas(filtros),
    calcularTiempoMedioResolucionDias(filtros),
    calcularOtPorEstado(),
    calcularOtPorCliente(),
    calcularOtPorResponsable(),
    calcularCotizacionesPorEstado(filtros),
    contarTicketsSinResponderFueraDeSla(),
    calcularTiempoMedioPrimeraRespuestaHoras(filtros),
  ]);

  return {
    otActivas,
    otConSlaVencido,
    montoCotizacionesAprobadas,
    tiempoMedioResolucionDias,
    otPorEstado,
    otPorCliente,
    otPorResponsable,
    cotizacionesPorEstado,
    ticketsSinResponderFueraDeSla,
    tiempoMedioPrimeraRespuestaHoras,
  };
}
