import { AppDataSource } from "../config/dataSource.js";
import { CanalTicket } from "../entities/CanalTicket.js";
import type { OrigenOt } from "../entities/enums.js";
import { AppError } from "../errors/AppError.js";
import { violacionUnica } from "../errors/dbErrors.js";

// Fase C: catálogo administrable de Canal/Fuente de Ticket (antes enum fijo portal/correo/
// telefono/presencial/interno), mismo patrón CRUD que Departamento/TemaAyuda — sin DELETE real,
// solo activar/desactivar. Se expone al admin como "Fuentes" en la URL (GET/POST/PATCH
// /fuentes-ticket); el nombre en código sigue siendo "canal" por continuidad con el resto (ver
// entities/CanalTicket.ts).

export interface CanalTicketDto {
  id: string;
  nombre: string;
  orden: number;
  activo: boolean;
  esManual: boolean;
  origenOtEquivalente: OrigenOt;
}

function toDto(c: CanalTicket): CanalTicketDto {
  return { id: c.id, nombre: c.nombre, orden: c.orden, activo: c.activo, esManual: c.esManual, origenOtEquivalente: c.origenOtEquivalente };
}

function conflictoNombre(err: unknown): AppError | null {
  if (violacionUnica(err)) {
    return new AppError(409, "CONFLICT", "Ya existe un canal con ese nombre");
  }
  return null;
}

export async function listarCanalesTicket(): Promise<CanalTicketDto[]> {
  const filas = await AppDataSource.getRepository(CanalTicket).find({ order: { orden: "ASC", nombre: "ASC" } });
  return filas.map(toDto);
}

export interface CrearCanalTicketInput {
  nombre: string;
  orden?: number | undefined;
  activo?: boolean | undefined;
  esManual?: boolean | undefined;
  origenOtEquivalente: OrigenOt;
}

export async function crearCanalTicket(input: CrearCanalTicketInput): Promise<CanalTicketDto> {
  const repo = AppDataSource.getRepository(CanalTicket);
  const canal = repo.create({
    nombre: input.nombre,
    orden: input.orden ?? 0,
    activo: input.activo ?? true,
    esManual: input.esManual ?? false,
    origenOtEquivalente: input.origenOtEquivalente,
  });
  try {
    await repo.save(canal);
  } catch (err) {
    throw conflictoNombre(err) ?? err;
  }
  return toDto(canal);
}

export interface CambioCanalTicket {
  nombre?: string | undefined;
  orden?: number | undefined;
  activo?: boolean | undefined;
  esManual?: boolean | undefined;
  origenOtEquivalente?: OrigenOt | undefined;
}

export async function actualizarCanalTicket(id: string, cambios: CambioCanalTicket): Promise<CanalTicketDto> {
  const repo = AppDataSource.getRepository(CanalTicket);
  const canal = await repo.findOneBy({ id });
  if (!canal) throw new AppError(404, "NOT_FOUND", "Canal no encontrado");

  if (cambios.nombre !== undefined) canal.nombre = cambios.nombre;
  if (cambios.orden !== undefined) canal.orden = cambios.orden;
  if (cambios.activo !== undefined) canal.activo = cambios.activo;
  if (cambios.esManual !== undefined) canal.esManual = cambios.esManual;
  if (cambios.origenOtEquivalente !== undefined) canal.origenOtEquivalente = cambios.origenOtEquivalente;

  try {
    await repo.save(canal);
  } catch (err) {
    throw conflictoNombre(err) ?? err;
  }
  return toDto(canal);
}
