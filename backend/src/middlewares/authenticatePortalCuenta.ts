import type { NextFunction, Request, Response } from "express";
import { verifyPortalCuentaToken } from "../auth/portalCuentaToken.js";
import { AppError } from "../errors/AppError.js";

// Autenticación de cuenta de portal (Fase D): valida el JWT de sesión persistente
// (scope:'portal-cuenta', 7 días) y deja req.portalCuenta = { cuentaId, email }. Mismo patrón que
// authenticatePortal.ts (scope:'portal', 15 min por ticket): nunca consulta la BD acá, solo
// verifica firma/expiración/scope. Un token de portal por ticket, o uno interno, no sirve acá
// (scope distinto) y viceversa.
export function authenticatePortalCuenta(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new AppError(401, "UNAUTHENTICATED", "Token no proporcionado");

  try {
    const payload = verifyPortalCuentaToken(token);
    req.portalCuenta = { cuentaId: payload.cuentaId, email: payload.email };
  } catch {
    // Mismo mensaje/código exista, haya expirado, o sea un token de otro scope: defensa en
    // profundidad simétrica a la de authenticatePortal.ts.
    throw new AppError(401, "INVALID_TOKEN", "Token inválido o expirado");
  }

  next();
}
