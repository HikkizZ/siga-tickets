import { QueryFailedError } from "typeorm";
import { AppError } from "./AppError.js";

// Errores de SQL Server que interesan al mapeo a AppError (el driver los expone en `number`):
//   2627 = violación de UNIQUE constraint, 2601 = de unique index (incluye los filtrados)
//   547  = violación de FK o CHECK
//   50001+ = THROW propios de los triggers (50001 asignacion_sin_solape, 50002 evento_inmutable)
//   1205 = víctima de deadlock (reintentable)
export const ERR_UNICO = [2627, 2601];
export const ERR_FK_O_CHECK = 547;
export const ERR_ASIGNACION_SOLAPE = 50001;
export const ERR_EVENTO_INMUTABLE = 50002;
export const ERR_DEADLOCK = 1205;

export function numeroErrorSql(err: unknown): number | undefined {
  if (!(err instanceof QueryFailedError)) return undefined;
  return (err.driverError as { number?: number }).number;
}

// Si el error es una violación de unicidad devuelve el mensaje del motor (trae el nombre del
// constraint/índice entre comillas simples); si no, null.
export function violacionUnica(err: unknown): { mensaje: string } | null {
  const numero = numeroErrorSql(err);
  if (numero === undefined || !ERR_UNICO.includes(numero)) return null;
  return { mensaje: (err as QueryFailedError).driverError.message ?? "" };
}

// Errores que en una carrera significan "otro te ganó": 2627/2601 (índice único del tramo
// abierto), 50001 (trigger de solape) y 1205 (deadlock). Se responden como 409 reintentable.
export function conflictoConcurrencia(err: unknown): AppError | null {
  const numero = numeroErrorSql(err);
  if (numero === undefined) return null;
  if (ERR_UNICO.includes(numero) || numero === ERR_ASIGNACION_SOLAPE || numero === ERR_DEADLOCK) {
    return new AppError(409, "CONFLICTO_CONCURRENCIA", "La OT fue modificada por otra operación al mismo tiempo; reintenta");
  }
  return null;
}
