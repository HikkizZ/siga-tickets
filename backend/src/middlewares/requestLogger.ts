import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { logger } from "../config/logger.js";

// requestId siempre generado aquí (no se acepta uno del cliente) y adjunto a req.log.
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  req.id = randomUUID();
  req.log = logger.child({ requestId: req.id });
  res.setHeader("X-Request-Id", req.id);

  const inicio = Date.now();
  res.on("finish", () => {
    // req.path (sin query string): la query puede traer correos o datos del solicitante.
    req.log.info({ method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - inicio }, "request");
  });

  next();
}
