import { AppDataSource } from "../config/dataSource.js";
import { TemaAyuda } from "../entities/TemaAyuda.js";
import type { Prioridad } from "../entities/enums.js";
import { AppError } from "../errors/AppError.js";
import { violacionUnica } from "../errors/dbErrors.js";
import { exigirDepartamentoExistente } from "./departamento.service.js";

export interface TemaAyudaDto {
  id: string;
  nombre: string;
  activo: boolean;
  esPublico: boolean;
  departamento: { id: string; nombre: string } | null;
  prioridadSugerida: Prioridad | null;
  orden: number;
}

function toTemaAyudaDto(t: TemaAyuda): TemaAyudaDto {
  return {
    id: t.id,
    nombre: t.nombre,
    activo: t.activo,
    esPublico: t.esPublico,
    departamento: t.departamento ? { id: t.departamento.id, nombre: t.departamento.nombre } : null,
    prioridadSugerida: t.prioridadSugerida,
    orden: t.orden,
  };
}

function conflictoNombre(err: unknown): AppError | null {
  if (violacionUnica(err)) {
    return new AppError(409, "CONFLICT", "Ya existe un tema de ayuda con ese nombre");
  }
  return null;
}

async function obtenerConDepartamento(id: string): Promise<TemaAyudaDto> {
  const tema = await AppDataSource.getRepository(TemaAyuda).findOne({ where: { id }, relations: { departamento: true } });
  if (!tema) throw new AppError(404, "NOT_FOUND", "Tema de ayuda no encontrado");
  return toTemaAyudaDto(tema);
}

export async function listarTemasAyuda(): Promise<TemaAyudaDto[]> {
  const temas = await AppDataSource.getRepository(TemaAyuda).find({
    relations: { departamento: true },
    order: { orden: "ASC", nombre: "ASC" },
  });
  return temas.map(toTemaAyudaDto);
}

export interface CrearTemaAyudaInput {
  nombre: string;
  activo?: boolean | undefined;
  esPublico?: boolean | undefined;
  departamentoId?: string | undefined;
  prioridadSugerida?: Prioridad | undefined;
  orden?: number | undefined;
}

export async function crearTemaAyuda(input: CrearTemaAyudaInput): Promise<TemaAyudaDto> {
  if (input.departamentoId) await exigirDepartamentoExistente(input.departamentoId);

  const repo = AppDataSource.getRepository(TemaAyuda);
  const tema = repo.create({
    nombre: input.nombre,
    activo: input.activo ?? true,
    esPublico: input.esPublico ?? true,
    departamentoId: input.departamentoId ?? null,
    prioridadSugerida: input.prioridadSugerida ?? null,
    orden: input.orden ?? 0,
  });
  try {
    await repo.save(tema);
  } catch (err) {
    throw conflictoNombre(err) ?? err;
  }
  return obtenerConDepartamento(tema.id);
}

export interface ActualizarTemaAyudaInput {
  nombre?: string | undefined;
  activo?: boolean | undefined;
  esPublico?: boolean | undefined;
  departamentoId?: string | null | undefined;
  prioridadSugerida?: Prioridad | null | undefined;
  orden?: number | undefined;
}

export async function actualizarTemaAyuda(id: string, cambios: ActualizarTemaAyudaInput): Promise<TemaAyudaDto> {
  const repo = AppDataSource.getRepository(TemaAyuda);
  const tema = await repo.findOneBy({ id });
  if (!tema) throw new AppError(404, "NOT_FOUND", "Tema de ayuda no encontrado");

  if (cambios.nombre !== undefined) tema.nombre = cambios.nombre;
  if (cambios.activo !== undefined) tema.activo = cambios.activo;
  if (cambios.esPublico !== undefined) tema.esPublico = cambios.esPublico;
  if (cambios.departamentoId !== undefined) {
    if (cambios.departamentoId) await exigirDepartamentoExistente(cambios.departamentoId);
    tema.departamentoId = cambios.departamentoId;
  }
  if (cambios.prioridadSugerida !== undefined) tema.prioridadSugerida = cambios.prioridadSugerida;
  if (cambios.orden !== undefined) tema.orden = cambios.orden;

  try {
    await repo.save(tema);
  } catch (err) {
    throw conflictoNombre(err) ?? err;
  }
  return obtenerConDepartamento(id);
}
