import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";
import type { Rol } from "../entities/enums.js";

export interface AuthTokenPayload {
  sub: string;
  username: string;
  rol: Rol;
}

type DecodedToken = AuthTokenPayload & { iat: number; exp: number };

const RENEW_THRESHOLD_SECONDS = 30 * 60;

export function signToken(payload: AuthTokenPayload): string {
  const options: SignOptions = { expiresIn: env.jwt.expiresIn as SignOptions["expiresIn"] };
  return jwt.sign(payload, env.jwt.secret, options);
}

export function verifyToken(token: string): DecodedToken {
  return jwt.verify(token, env.jwt.secret) as DecodedToken;
}

export function shouldRenew(exp: number): boolean {
  const secondsLeft = exp - Math.floor(Date.now() / 1000);
  return secondsLeft < RENEW_THRESHOLD_SECONDS;
}
