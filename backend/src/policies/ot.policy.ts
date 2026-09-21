import { Rol } from "../entities/enums.js";
import { AppError } from "../errors/AppError.js";

// Permisos por fila de la matriz RBAC (docs/backend-diseno.md sección 6). Funciones puras:
// las invocan los servicios (no solo los middlewares) y son testeables sin BD.
// `authorize()` ya filtró el rol mínimo; aquí se decide por la relación del usuario con la OT.

export interface ContextoOt {
  usuario: { id: string; rol: Rol };
  responsableActualId: string | null;
  esColaborador: boolean;
}

const esGestor = (c: ContextoOt) => c.usuario.rol === Rol.ADMIN || c.usuario.rol === Rol.GESTION;
const esTecnico = (c: ContextoOt) => c.usuario.rol === Rol.TECNICO;
const esResponsable = (c: ContextoOt) => c.responsableActualId !== null && c.responsableActualId === c.usuario.id;

// Editar, cambiar estado/prioridad, comentar, subir adjuntos: responsable o colaborador.
export function puedeEditarOt(c: ContextoOt): boolean {
  return esGestor(c) || (esTecnico(c) && (esResponsable(c) || c.esColaborador));
}
export const puedeCambiarEstado = puedeEditarOt;
export const puedeComentar = puedeEditarOt;
export const puedeSubirAdjunto = puedeEditarOt;

// Derivar: solo el responsable actual (un colaborador NO puede).
export function puedeDerivar(c: ContextoOt): boolean {
  return esGestor(c) || (esTecnico(c) && esResponsable(c));
}

// Colaboradores y etapas: solo el responsable actual.
export function puedeGestionarColaboradores(c: ContextoOt): boolean {
  return esGestor(c) || (esTecnico(c) && esResponsable(c));
}
export const puedeEditarEtapas = puedeGestionarColaboradores;

// Añadir colaborador: quien gestiona colaboradores, o cualquier tecnico añadiéndose a sí mismo.
// (`lectura` nunca: el rol no es tecnico.) Quitar sigue siendo puedeGestionarColaboradores.
export function puedeAgregarColaborador(c: ContextoOt, usuarioId: string): boolean {
  return puedeGestionarColaboradores(c) || (esTecnico(c) && usuarioId === c.usuario.id);
}

// Registrar horas: gestion/admin de cualquiera; tecnico solo las propias y solo si es responsable o colaborador.
export function puedeRegistrarHoras(c: ContextoOt, usuarioDeLaHoraId: string): boolean {
  return esGestor(c) || (esTecnico(c) && usuarioDeLaHoraId === c.usuario.id && (esResponsable(c) || c.esColaborador));
}

// Borrar horas: gestion/admin de cualquiera; tecnico solo las propias (no exige relación con la OT).
export function puedeGestionarHoras(c: ContextoOt, usuarioDeLaHoraId: string): boolean {
  return esGestor(c) || (esTecnico(c) && usuarioDeLaHoraId === c.usuario.id);
}

export function exigir(permitido: boolean, mensaje = "No tienes permiso para esta acción sobre la OT"): void {
  if (!permitido) throw new AppError(403, "PERMISO_DENEGADO", mensaje);
}
