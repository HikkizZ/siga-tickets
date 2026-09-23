import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

// JWT de cuenta de portal (Fase D): sesión persistente para clientes que se registraron, SUMADA
// al token de portal por ticket (scope:'portal', 15 min, ver auth/portalToken.ts) — no lo
// reemplaza. Mismo secreto (mismo servidor, misma clave); lo que separa este token de un token de
// portal por ticket y de uno interno es el campo `scope`, verificado explícitamente en cada
// middleware (authenticate.ts, authenticatePortal.ts, authenticatePortalCuenta.ts).
export interface PortalCuentaTokenPayload {
  scope: "portal-cuenta";
  cuentaId: string;
  email: string;
}

type DecodedPortalCuentaToken = PortalCuentaTokenPayload & { iat: number; exp: number };

// 7 días: una sesión persistente de verdad (a diferencia del token de un ticket puntual, 15 min),
// pero no eterna. Sin recuperación de contraseña en esta fase: si el cliente pierde el acceso,
// vuelve a loguearse con su contraseña.
const PORTAL_CUENTA_TOKEN_TTL = "7d";

export function signPortalCuentaToken(cuentaId: string, email: string): string {
  const payload: PortalCuentaTokenPayload = { scope: "portal-cuenta", cuentaId, email };
  return jwt.sign(payload, env.jwt.secret, { expiresIn: PORTAL_CUENTA_TOKEN_TTL });
}

// Lanza si el token no es válido, expiró, o no es de cuenta de portal (scope distinto/ausente): el
// llamador (authenticatePortalCuenta) traduce cualquier excepción a 401 INVALID_TOKEN sin
// distinguir el motivo.
export function verifyPortalCuentaToken(token: string): DecodedPortalCuentaToken {
  const decoded = jwt.verify(token, env.jwt.secret) as unknown as Record<string, unknown>;
  if (decoded.scope !== "portal-cuenta" || typeof decoded.cuentaId !== "string" || typeof decoded.email !== "string") {
    throw new Error("Token no es de cuenta de portal");
  }
  return decoded as unknown as DecodedPortalCuentaToken;
}
