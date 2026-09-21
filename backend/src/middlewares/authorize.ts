import type { NextFunction, Request, Response } from "express";
import { Rol } from "../entities/enums.js";
import { AppError } from "../errors/AppError.js";

// La tabla de la API del diseño habla de "rol mínimo": cada rol incluye a los de abajo.
const NIVEL: Record<Rol, number> = {
  [Rol.LECTURA]: 1,
  [Rol.TECNICO]: 2,
  [Rol.GESTION]: 3,
  [Rol.ADMIN]: 4,
};

// Control grueso por rol; los permisos por fila (responsable/colaborador) irán en policies/.
export function authorize(minimo: Rol) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Usuario no autenticado");
    if (NIVEL[req.user.rol] < NIVEL[minimo]) throw new AppError(403, "FORBIDDEN", "Permisos insuficientes");
    next();
  };
}
