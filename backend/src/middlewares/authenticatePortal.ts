import type { NextFunction, Request, Response } from "express";
import { verifyPortalToken } from "../auth/portalToken.js";
import { AppError } from "../errors/AppError.js";

// Autenticación del portal público (Fase 5): valida el JWT de portal (scope:'portal', 15 min) y
// deja req.portal = { ticketId }. Nunca consulta la BD (el ticket se resuelve en el servicio que
// lo necesite): esto es solo verificación de firma/expiración/scope.
export function authenticatePortal(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new AppError(401, "UNAUTHENTICATED", "Token no proporcionado");

  try {
    const payload = verifyPortalToken(token);
    req.portal = { ticketId: payload.ticketId };
  } catch {
    // Mismo mensaje/código exista, haya expirado, o sea un token interno (scope distinto de
    // 'portal'): defensa en profundidad simétrica a la de authenticate.ts.
    throw new AppError(401, "INVALID_TOKEN", "Token inválido o expirado");
  }

  next();
}
