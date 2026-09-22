import { Rol } from "../entities/enums.js";
import { AppError } from "../errors/AppError.js";

// A diferencia de OT, las cotizaciones no tienen permiso por fila (responsable/colaborador):
// sección 6 del diseño dice "Cotizaciones (crear/editar/enviar/aprobar): admin, gestion" sin
// excepción para tecnico, ni siquiera si es responsable de la OT vinculada. El filtro grueso
// `authorize(Rol.GESTION)` en las rutas ya basta, pero se repite aquí como segunda capa (mismo
// estilo que ot.policy.ts: función pura, invocada también desde el servicio).
export function puedeEscribirCotizacion(rol: Rol): boolean {
  return rol === Rol.ADMIN || rol === Rol.GESTION;
}

export function exigirEscrituraCotizacion(rol: Rol): void {
  if (!puedeEscribirCotizacion(rol)) {
    throw new AppError(403, "PERMISO_DENEGADO", "Solo gestión o admin pueden escribir cotizaciones");
  }
}
