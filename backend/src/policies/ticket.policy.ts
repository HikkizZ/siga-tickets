import { Rol } from "../entities/enums.js";
import { AppError } from "../errors/AppError.js";

// Igual espíritu que ot.policy.ts, pero SIN colaborador: el esquema no tiene una tabla
// ticket_colaborador (desviación pactada en la Fase 3, documentada en backend-diseno.md). Donde
// la sección 6 del diseño dice "responsable o colaborador" para una fila de ticket, en la
// práctica es solo "responsable actual" (no hay colaborador que sustituya).

export interface ContextoTicket {
  usuario: { id: string; rol: Rol };
  responsableActualId: string | null;
}

const esGestor = (c: ContextoTicket) => c.usuario.rol === Rol.ADMIN || c.usuario.rol === Rol.GESTION;
const esTecnico = (c: ContextoTicket) => c.usuario.rol === Rol.TECNICO;
const esResponsable = (c: ContextoTicket) => c.responsableActualId !== null && c.responsableActualId === c.usuario.id;

// Editar, cambiar estado, publicar mensajes (nota interna o respuesta), subir adjuntos:
// responsable actual, gestión o admin.
export function puedeEditarTicket(c: ContextoTicket): boolean {
  return esGestor(c) || (esTecnico(c) && esResponsable(c));
}
export const puedeCambiarEstado = puedeEditarTicket;
export const puedePublicarMensaje = puedeEditarTicket;
export const puedeSubirAdjunto = puedeEditarTicket;

// Derivar: responsable actual, gestión o admin (igual que OT; un ticket sin responsable no
// convierte a nadie en responsable, así que un tecnico nunca puede derivar uno sin tomar antes).
export function puedeDerivar(c: ContextoTicket): boolean {
  return esGestor(c) || (esTecnico(c) && esResponsable(c));
}

// Tomar: cualquier técnico (o gestión/admin) puede tomar un ticket sin responsable; el servicio
// exige además que responsable_actual_id sea NULL (409 TICKET_YA_ASIGNADO si no).
export function puedeTomar(c: ContextoTicket): boolean {
  return esGestor(c) || esTecnico(c);
}

// Convertir a OT / vincular-desvincular una OT existente: solo admin y gestión (sección 6: sin
// excepción por fila, ni siquiera para el responsable actual del ticket).
export function puedeConvertirOVincular(rol: Rol): boolean {
  return rol === Rol.ADMIN || rol === Rol.GESTION;
}

export function exigir(permitido: boolean, mensaje = "No tienes permiso para esta acción sobre el ticket"): void {
  if (!permitido) throw new AppError(403, "PERMISO_DENEGADO", mensaje);
}

export function exigirConversion(rol: Rol): void {
  if (!puedeConvertirOVincular(rol)) {
    throw new AppError(403, "PERMISO_DENEGADO", "Solo gestión o admin convierten o vinculan un ticket a una OT");
  }
}
