import { AppDataSource } from "../config/dataSource.js";
import { PlanSla } from "../entities/PlanSla.js";
import { Prioridad } from "../entities/Prioridad.js";
import { AppError } from "../errors/AppError.js";
import { violacionUnica } from "../errors/dbErrors.js";
import { enTransaccion } from "./folio.service.js";
import { recalcularAbiertosPorPrioridad } from "./sla.calculo.service.js";

// Fase B2: catálogo CRUD de Planes SLA con nombre propio. Fase C: Prioridad.planSlaId lo conecta al
// cálculo real de SLA (retira sla_config) — ver entities/PlanSla.ts y entities/Prioridad.ts.

export interface PlanSlaDto {
  id: string;
  nombre: string;
  activo: boolean;
  horasResolucion: number;
  horasPrimeraRespuesta: number;
  usarHorasHabiles: boolean;
  pausarEnEsperaCliente: boolean;
  umbralPorVencer: number;
  creadoEn: Date;
  actualizadoEn: Date;
}

function toDto(p: PlanSla): PlanSlaDto {
  return {
    id: p.id,
    nombre: p.nombre,
    activo: p.activo,
    horasResolucion: p.horasResolucion,
    horasPrimeraRespuesta: p.horasPrimeraRespuesta,
    usarHorasHabiles: p.usarHorasHabiles,
    pausarEnEsperaCliente: p.pausarEnEsperaCliente,
    umbralPorVencer: p.umbralPorVencer,
    creadoEn: p.creadoEn,
    actualizadoEn: p.actualizadoEn,
  };
}

function conflictoNombre(err: unknown): AppError | null {
  if (violacionUnica(err)) {
    return new AppError(409, "CONFLICT", "Ya existe un plan SLA con ese nombre");
  }
  return null;
}

export async function listarPlanesSla(): Promise<PlanSlaDto[]> {
  const planes = await AppDataSource.getRepository(PlanSla).find({ order: { nombre: "ASC" } });
  return planes.map(toDto);
}

export interface CrearPlanSlaInput {
  nombre: string;
  horasResolucion: number;
  horasPrimeraRespuesta: number;
  usarHorasHabiles?: boolean | undefined;
  pausarEnEsperaCliente?: boolean | undefined;
  umbralPorVencer?: number | undefined;
  activo?: boolean | undefined;
}

export async function crearPlanSla(input: CrearPlanSlaInput): Promise<PlanSlaDto> {
  const repo = AppDataSource.getRepository(PlanSla);
  const plan = repo.create(input);
  try {
    await repo.save(plan);
  } catch (err) {
    throw conflictoNombre(err) ?? err;
  }
  // Se relee de la BD en vez de confiar en `plan` tal cual quedó tras save(): el driver mssql, al
  // mezclar el OUTPUT del INSERT de vuelta en la entidad, deja en memoria un `umbralPorVencer` de
  // 0 aunque la fila en BD quedó bien (0.20) — mismo motivo por el que sla.config.service.ts y
  // ot.subrecursos.service.ts::registrarHoras tampoco confían en la entidad recién guardada para
  // sus columnas decimal.
  return toDto(await repo.findOneByOrFail({ id: plan.id }));
}

export interface CambioPlanSla {
  nombre?: string | undefined;
  activo?: boolean | undefined;
  horasResolucion?: number | undefined;
  horasPrimeraRespuesta?: number | undefined;
  usarHorasHabiles?: boolean | undefined;
  pausarEnEsperaCliente?: boolean | undefined;
  umbralPorVencer?: number | undefined;
}

// Cuando cambian los umbrales/horas de un plan, recalcula en la misma transacción los
// tickets/OT ABIERTOS de cualquier prioridad que apunte a él (mismo espíritu que tenía
// sla.config.service.ts::actualizarSlaConfig llamando a recalcularAbiertosPorPrioridad, ahora
// retirado — ver sla.calculo.service.ts).
export async function actualizarPlanSla(id: string, cambios: CambioPlanSla): Promise<PlanSlaDto> {
  const dto = await enTransaccion(AppDataSource, async (m) => {
    const plan = await m.findOneBy(PlanSla, { id });
    if (!plan) throw new AppError(404, "NOT_FOUND", "Plan SLA no encontrado");

    if (cambios.nombre !== undefined) plan.nombre = cambios.nombre;
    if (cambios.activo !== undefined) plan.activo = cambios.activo;
    if (cambios.horasResolucion !== undefined) plan.horasResolucion = cambios.horasResolucion;
    if (cambios.horasPrimeraRespuesta !== undefined) plan.horasPrimeraRespuesta = cambios.horasPrimeraRespuesta;
    if (cambios.usarHorasHabiles !== undefined) plan.usarHorasHabiles = cambios.usarHorasHabiles;
    if (cambios.pausarEnEsperaCliente !== undefined) plan.pausarEnEsperaCliente = cambios.pausarEnEsperaCliente;
    if (cambios.umbralPorVencer !== undefined) plan.umbralPorVencer = cambios.umbralPorVencer;

    try {
      await m.save(PlanSla, plan);
    } catch (err) {
      throw conflictoNombre(err) ?? err;
    }
    // Mismo motivo que en crearPlanSla(): no confiar en `plan` post-save para el campo decimal.
    const actualizado = await m.findOneByOrFail(PlanSla, { id });

    const prioridades = await m.find(Prioridad, { where: { planSlaId: id } });
    for (const p of prioridades) {
      await recalcularAbiertosPorPrioridad(m, p.id, {
        horasResolucion: actualizado.horasResolucion,
        horasPrimeraRespuesta: actualizado.horasPrimeraRespuesta,
        usarHorasHabiles: actualizado.usarHorasHabiles,
      });
    }
    return actualizado;
  });
  return toDto(dto);
}

// A diferencia de Departamentos/Temas de ayuda, un Plan SLA sí se puede borrar de verdad. Fase C:
// ahora prioridad.plan_sla_id SÍ puede apuntar a este plan (ON DELETE SET NULL); antes de borrar,
// cualquier prioridad que lo referencie se recalcula como "sin SLA" (sus vencimientos abiertos
// quedan en NULL, consistente con "sin plan = sin SLA").
export async function eliminarPlanSla(id: string): Promise<void> {
  await enTransaccion(AppDataSource, async (m) => {
    const prioridades = await m.find(Prioridad, { where: { planSlaId: id } });
    const res = await m.delete(PlanSla, { id });
    if (!res.affected) throw new AppError(404, "NOT_FOUND", "Plan SLA no encontrado");
    for (const p of prioridades) {
      await recalcularAbiertosPorPrioridad(m, p.id, null);
    }
  });
}
