import rateLimit from "express-rate-limit";
import type { Request } from "express";
import { env } from "../config/env.js";

// Generaliza el patrón de auth/loginRateLimiter.ts para los endpoints públicos de la Fase 5: cada
// llamada crea un limitador nuevo (su propio MemoryStore), así que dos rutas nunca comparten
// contador por accidente.
//
// skipEnTest (default true): igual que loginRateLimiter, se salta en NODE_ENV=test para no
// interferir con el resto de la suite (que comparte una sola app/proceso durante toda la corrida:
// un contador que sobreviviera entre archivos de test rompería pruebas no relacionadas). El
// mecanismo en sí se prueba aparte, con skipEnTest:false sobre una app aislada — ver
// routes/portal.ratelimit.test.ts.
export interface OpcionesLimitador {
  windowMs: number;
  limit: number;
  codigo?: string;
  keyGenerator?: (req: Request) => string;
  skipEnTest?: boolean;
}

function crearLimitador(opts: OpcionesLimitador) {
  const skipEnTest = opts.skipEnTest ?? true;
  return rateLimit({
    windowMs: opts.windowMs,
    limit: opts.limit,
    standardHeaders: true,
    legacyHeaders: false,
    ...(opts.keyGenerator ? { keyGenerator: opts.keyGenerator } : {}),
    skip: () => skipEnTest && env.nodeEnv === "test",
    message: {
      status: "error",
      code: opts.codigo ?? "RATE_LIMITED",
      message: "Demasiadas solicitudes. Intenta de nuevo más tarde.",
    },
  });
}

// Límite por IP (keyGenerator por defecto de express-rate-limit = req.ip).
export function limitarPorIp(opts: Omit<OpcionesLimitador, "keyGenerator">) {
  return crearLimitador(opts);
}

// Límite adicional por un campo de texto del body (el diseño exige explícitamente "rate limit por
// IP y por correo" para el seguimiento del portal, no solo por IP). Se normaliza a minúsculas y sin
// espacios para que variantes de mayúsculas del mismo correo compartan el contador.
export function limitarPorCampoBody(campo: string, opts: Omit<OpcionesLimitador, "keyGenerator">) {
  return crearLimitador({
    ...opts,
    keyGenerator: (req: Request) => {
      const valor = (req.body as Record<string, unknown> | undefined)?.[campo];
      return typeof valor === "string" ? valor.trim().toLowerCase() : "sin-valor";
    },
  });
}
