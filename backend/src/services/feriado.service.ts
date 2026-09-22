import { AppDataSource } from "../config/dataSource.js";
import { Feriado } from "../entities/Feriado.js";
import { AppError } from "../errors/AppError.js";
import { violacionUnica } from "../errors/dbErrors.js";

export interface FeriadoDto {
  fecha: string;
  nombre: string;
  irrenunciable: boolean;
}

const toDto = (f: Feriado): FeriadoDto => ({ fecha: f.fecha, nombre: f.nombre, irrenunciable: f.irrenunciable });

export async function listarFeriados(): Promise<FeriadoDto[]> {
  const filas = await AppDataSource.getRepository(Feriado).find({ order: { fecha: "ASC" } });
  return filas.map(toDto);
}

export async function crearFeriado(input: { fecha: string; nombre: string; irrenunciable: boolean }): Promise<FeriadoDto> {
  const repo = AppDataSource.getRepository(Feriado);
  try {
    // insert() (no save()): `fecha` es la PK asignada a mano, no generada. save() de TypeORM
    // decide INSERT vs UPDATE mirando si la PK ya viene puesta en la entidad, así que con una PK
    // manual haría un upsert silencioso (pisaría el feriado existente) en vez de violar la PK.
    // insert() siempre emite un INSERT real, que sí dispara 2627 en un `fecha` duplicado.
    await repo.insert(input);
  } catch (err) {
    if (violacionUnica(err)) throw new AppError(409, "FERIADO_YA_EXISTE", "Ya existe un feriado en esa fecha");
    throw err;
  }
  return { fecha: input.fecha, nombre: input.nombre, irrenunciable: input.irrenunciable };
}

export async function eliminarFeriado(fecha: string): Promise<void> {
  const r = await AppDataSource.getRepository(Feriado).delete({ fecha });
  if (!r.affected) throw new AppError(404, "FERIADO_NO_ENCONTRADO", "Feriado no encontrado");
}
