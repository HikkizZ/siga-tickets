import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

// JWT del portal público (Fase 5): payload MÍNIMO y de corta duración, sin datos personales. Se
// firma con el mismo secreto que los tokens internos (no hay una necesidad real de un secreto
// aparte: son el mismo servidor, la misma clave; lo que separa un token de portal de uno interno es
// el campo `scope`, verificado explícitamente en ambos lados — ver middlewares/authenticate.ts y
// middlewares/authenticatePortal.ts).
export interface PortalTokenPayload {
  scope: "portal";
  ticketId: string;
}

type DecodedPortalToken = PortalTokenPayload & { iat: number; exp: number };

const PORTAL_TOKEN_TTL = "15m";

export function signPortalToken(ticketId: string): string {
  const payload: PortalTokenPayload = { scope: "portal", ticketId };
  return jwt.sign(payload, env.jwt.secret, { expiresIn: PORTAL_TOKEN_TTL });
}

// Lanza si el token no es válido, expiró, o no es de portal (scope distinto/ausente): el llamador
// (authenticatePortal) traduce cualquier excepción a 401 INVALID_TOKEN sin distinguir el motivo.
export function verifyPortalToken(token: string): DecodedPortalToken {
  const decoded = jwt.verify(token, env.jwt.secret) as unknown as Record<string, unknown>;
  if (decoded.scope !== "portal" || typeof decoded.ticketId !== "string") {
    throw new Error("Token no es de portal");
  }
  return decoded as unknown as DecodedPortalToken;
}
