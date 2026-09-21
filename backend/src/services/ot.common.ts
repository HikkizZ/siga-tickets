import { Ot } from "../entities/Ot.js";
import { Usuario, SISTEMA_USERNAME } from "../entities/Usuario.js";
import type { Rol } from "../entities/enums.js";
import { AppError } from "../errors/AppError.js";
import type { ContextoOt } from "../policies/ot.policy.js";
import type { ManagerTransaccional } from "./folio.service.js";

export interface UsuarioActor {
  id: string;
  rol: Rol;
}

export interface UsuarioRef {
  id: string;
  nombre: string;
}

export function otNoEncontrada(): AppError {
  return new AppError(404, "OT_NO_ENCONTRADA", "OT no encontrada");
}

// Toma el lock de la fila de la OT (UPDLOCK) hasta el fin de la transacción: serializa las
// operaciones que la modifican y hace que quien llega segundo vea el estado ya confirmado.
export async function bloquearOt(manager: ManagerTransaccional, id: string): Promise<Ot> {
  const ot = await manager.findOne(Ot, { where: { id }, lock: { mode: "pessimistic_write" } });
  if (!ot) throw otNoEncontrada();
  return ot;
}

export async function esColaborador(manager: ManagerTransaccional, otId: string, usuarioId: string): Promise<boolean> {
  const filas = await manager.query(`SELECT 1 AS x FROM ot_colaborador WHERE ot_id = @0 AND usuario_id = @1`, [otId, usuarioId]);
  return filas.length > 0;
}

export async function contextoOt(manager: ManagerTransaccional, ot: Ot, actor: UsuarioActor): Promise<ContextoOt> {
  return {
    usuario: actor,
    responsableActualId: ot.responsableActualId,
    esColaborador: await esColaborador(manager, ot.id, actor.id),
  };
}

// Usuario que puede recibir trabajo: existe, activo y no es el usuario técnico `sistema`.
export async function usuarioAsignable(
  manager: ManagerTransaccional,
  id: string,
  codigo: string,
  etiqueta: string,
): Promise<Usuario> {
  const u = await manager.findOne(Usuario, { where: { id } });
  if (!u || !u.activo || u.username === SISTEMA_USERNAME) {
    throw new AppError(400, codigo, `${etiqueta} debe ser un usuario existente y activo`);
  }
  return u;
}

// Hora del servidor de BD (datetimeoffset(3)): la misma fuente que los DEFAULT de las columnas.
export async function ahoraDb(manager: ManagerTransaccional): Promise<Date> {
  const filas: Array<{ ahora: Date }> = await manager.query(`SELECT CAST(SYSDATETIMEOFFSET() AS datetimeoffset(3)) AS ahora`);
  return filas[0]!.ahora;
}

