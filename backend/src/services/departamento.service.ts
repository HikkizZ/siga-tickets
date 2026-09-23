import { AppDataSource } from "../config/dataSource.js";
import { Departamento } from "../entities/Departamento.js";
import { AppError } from "../errors/AppError.js";
import { violacionUnica } from "../errors/dbErrors.js";

export interface DepartamentoDto {
  id: string;
  nombre: string;
  activo: boolean;
}

function toDepartamentoDto(d: Departamento): DepartamentoDto {
  return { id: d.id, nombre: d.nombre, activo: d.activo };
}

function conflictoNombre(err: unknown): AppError | null {
  if (violacionUnica(err)) {
    return new AppError(409, "CONFLICT", "Ya existe un departamento con ese nombre");
  }
  return null;
}

export async function listarDepartamentos(): Promise<DepartamentoDto[]> {
  const departamentos = await AppDataSource.getRepository(Departamento).find({ order: { nombre: "ASC" } });
  return departamentos.map(toDepartamentoDto);
}

export async function crearDepartamento(nombre: string): Promise<DepartamentoDto> {
  const repo = AppDataSource.getRepository(Departamento);
  const departamento = repo.create({ nombre });
  try {
    await repo.save(departamento);
  } catch (err) {
    throw conflictoNombre(err) ?? err;
  }
  return toDepartamentoDto(departamento);
}

export async function actualizarDepartamento(
  id: string,
  cambios: { nombre?: string | undefined; activo?: boolean | undefined },
): Promise<DepartamentoDto> {
  const repo = AppDataSource.getRepository(Departamento);
  const departamento = await repo.findOneBy({ id });
  if (!departamento) throw new AppError(404, "NOT_FOUND", "Departamento no encontrado");

  if (cambios.nombre !== undefined) departamento.nombre = cambios.nombre;
  if (cambios.activo !== undefined) departamento.activo = cambios.activo;

  try {
    await repo.save(departamento);
  } catch (err) {
    throw conflictoNombre(err) ?? err;
  }
  return toDepartamentoDto(departamento);
}

// Uso exclusivo de temaAyuda.service.ts para validar un departamentoId opcional al crear/editar
// un tema de ayuda (solo existencia: un departamento desactivado más tarde puede seguir siendo
// la sugerencia por defecto de un tema, no hay una regla que lo prohíba en esta fase).
export async function exigirDepartamentoExistente(id: string): Promise<void> {
  const existe = await AppDataSource.getRepository(Departamento).exists({ where: { id } });
  if (!existe) throw new AppError(400, "DEPARTAMENTO_INVALIDO", "departamentoId debe ser un departamento existente");
}
