import { AppDataSource } from "../config/dataSource.js";
import { PlanSla } from "../entities/PlanSla.js";
import { AppError } from "../errors/AppError.js";
import { violacionUnica } from "../errors/dbErrors.js";

// Fase B2: catálogo CRUD de Planes SLA con nombre propio (ver entities/PlanSla.ts para el alcance
// acotado — todavía sin conexión al cálculo real de SLA, que sigue siendo sla_config).

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

export async function actualizarPlanSla(id: string, cambios: CambioPlanSla): Promise<PlanSlaDto> {
  const repo = AppDataSource.getRepository(PlanSla);
  const plan = await repo.findOneBy({ id });
  if (!plan) throw new AppError(404, "NOT_FOUND", "Plan SLA no encontrado");

  if (cambios.nombre !== undefined) plan.nombre = cambios.nombre;
  if (cambios.activo !== undefined) plan.activo = cambios.activo;
  if (cambios.horasResolucion !== undefined) plan.horasResolucion = cambios.horasResolucion;
  if (cambios.horasPrimeraRespuesta !== undefined) plan.horasPrimeraRespuesta = cambios.horasPrimeraRespuesta;
  if (cambios.usarHorasHabiles !== undefined) plan.usarHorasHabiles = cambios.usarHorasHabiles;
  if (cambios.pausarEnEsperaCliente !== undefined) plan.pausarEnEsperaCliente = cambios.pausarEnEsperaCliente;
  if (cambios.umbralPorVencer !== undefined) plan.umbralPorVencer = cambios.umbralPorVencer;

  try {
    await repo.save(plan);
  } catch (err) {
    throw conflictoNombre(err) ?? err;
  }
  // Mismo motivo que en crearPlanSla(): no confiar en `plan` post-save para el campo decimal.
  return toDto(await repo.findOneByOrFail({ id }));
}

// A diferencia de Departamentos/Temas de ayuda, un Plan SLA sí se puede borrar de verdad: hoy no
// hay ninguna FK que apunte a plan_sla (ver entities/PlanSla.ts). Si en el futuro algo lo
// referencia, este DELETE habrá que revisarlo (o reemplazarlo por un soft-delete vía `activo`).
export async function eliminarPlanSla(id: string): Promise<void> {
  const res = await AppDataSource.getRepository(PlanSla).delete({ id });
  if (!res.affected) throw new AppError(404, "NOT_FOUND", "Plan SLA no encontrado");
}
