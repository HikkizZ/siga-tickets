import { AppDataSource } from "../config/dataSource.js";
import { PlanSla } from "../entities/PlanSla.js";
import { Prioridad } from "../entities/Prioridad.js";
import { AppError } from "../errors/AppError.js";
import { violacionUnica } from "../errors/dbErrors.js";
import { enTransaccion, type ManagerTransaccional } from "./folio.service.js";
import { recalcularAbiertosPorPrioridad } from "./sla.calculo.service.js";

// Fase C: catálogo administrable de Prioridad (antes enum fijo alta/media/baja), mismo patrón CRUD
// que Departamento/TemaAyuda (Fase B) — sin DELETE real, solo activar/desactivar. Compartido por
// Ticket y Ot (ambos referencian esta misma tabla). Ver entities/Prioridad.ts para el diseño.

export interface PrioridadDto {
  id: string;
  nombre: string;
  orden: number;
  activo: boolean;
  planSlaId: string | null;
}

function toDto(p: Prioridad): PrioridadDto {
  return { id: p.id, nombre: p.nombre, orden: p.orden, activo: p.activo, planSlaId: p.planSlaId };
}

function conflictoNombre(err: unknown): AppError | null {
  if (violacionUnica(err)) {
    return new AppError(409, "CONFLICT", "Ya existe una prioridad con ese nombre");
  }
  return null;
}

export async function listarPrioridades(): Promise<PrioridadDto[]> {
  const filas = await AppDataSource.getRepository(Prioridad).find({ order: { orden: "ASC", nombre: "ASC" } });
  return filas.map(toDto);
}

// Uso exclusivo de temaAyuda.service.ts para validar una prioridadSugeridaId opcional (solo
// existencia, mismo criterio que exigirDepartamentoExistente: una prioridad desactivada más tarde
// puede seguir siendo la sugerencia, no hay una regla que lo prohíba en esta fase).
export async function exigirPrioridadExistente(id: string): Promise<void> {
  const existe = await AppDataSource.getRepository(Prioridad).exists({ where: { id } });
  if (!existe) throw new AppError(400, "PRIORIDAD_INVALIDA", "prioridadSugeridaId debe ser una prioridad existente");
}

// Compartida por ticket.service.ts, ot.service.ts y ticket.conversion.service.ts (Prioridad es la
// misma tabla para Ticket y Ot, ver entities/Prioridad.ts): existencia + activo, dentro de la misma
// transacción que la escritura, mismo criterio que exigirClienteActivoTicket.
export async function exigirPrioridadActiva(manager: ManagerTransaccional, prioridadId: string): Promise<Prioridad> {
  const p = await manager.findOne(Prioridad, { where: { id: prioridadId } });
  if (!p || !p.activo) throw new AppError(400, "PRIORIDAD_INVALIDA", "prioridadId debe ser una prioridad existente y activa");
  return p;
}

async function exigirPlanSlaExistente(planSlaId: string): Promise<void> {
  const existe = await AppDataSource.getRepository(PlanSla).exists({ where: { id: planSlaId } });
  if (!existe) throw new AppError(400, "PLAN_SLA_INVALIDO", "planSlaId debe ser un plan SLA existente");
}

export interface CrearPrioridadInput {
  nombre: string;
  orden?: number | undefined;
  activo?: boolean | undefined;
  planSlaId?: string | null | undefined;
}

export async function crearPrioridad(input: CrearPrioridadInput): Promise<PrioridadDto> {
  if (input.planSlaId) await exigirPlanSlaExistente(input.planSlaId);

  const repo = AppDataSource.getRepository(Prioridad);
  const prioridad = repo.create({
    nombre: input.nombre,
    orden: input.orden ?? 0,
    activo: input.activo ?? true,
    planSlaId: input.planSlaId ?? null,
  });
  try {
    await repo.save(prioridad);
  } catch (err) {
    throw conflictoNombre(err) ?? err;
  }
  return toDto(await repo.findOneByOrFail({ id: prioridad.id }));
}

export interface CambioPrioridad {
  nombre?: string | undefined;
  orden?: number | undefined;
  activo?: boolean | undefined;
  planSlaId?: string | null | undefined;
}

// Cuando cambia planSlaId (incluido a null), dispara el recálculo de vencimientos de lo abierto de
// esta prioridad, mismo mecanismo que slaPlan.service.ts::actualizarPlanSla/eliminarPlanSla (ver
// sla.calculo.service.ts::recalcularAbiertosPorPrioridad).
export async function actualizarPrioridad(id: string, cambios: CambioPrioridad): Promise<PrioridadDto> {
  const dto = await enTransaccion(AppDataSource, async (m) => {
    const prioridad = await m.findOneBy(Prioridad, { id });
    if (!prioridad) throw new AppError(404, "NOT_FOUND", "Prioridad no encontrada");

    if (cambios.nombre !== undefined) prioridad.nombre = cambios.nombre;
    if (cambios.orden !== undefined) prioridad.orden = cambios.orden;
    if (cambios.activo !== undefined) prioridad.activo = cambios.activo;

    let planCambio = false;
    if (cambios.planSlaId !== undefined && cambios.planSlaId !== prioridad.planSlaId) {
      if (cambios.planSlaId) await exigirPlanSlaExistente(cambios.planSlaId);
      prioridad.planSlaId = cambios.planSlaId;
      planCambio = true;
    }

    try {
      await m.save(Prioridad, prioridad);
    } catch (err) {
      throw conflictoNombre(err) ?? err;
    }
    const actualizada = await m.findOneOrFail(Prioridad, { where: { id }, relations: { planSla: true } });

    if (planCambio) {
      await recalcularAbiertosPorPrioridad(
        m,
        id,
        actualizada.planSla
          ? {
              horasResolucion: actualizada.planSla.horasResolucion,
              horasPrimeraRespuesta: actualizada.planSla.horasPrimeraRespuesta,
              usarHorasHabiles: actualizada.planSla.usarHorasHabiles,
            }
          : null,
      );
    }
    return actualizada;
  });
  return toDto(dto);
}
