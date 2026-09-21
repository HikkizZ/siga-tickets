import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError.js";
import { logger } from "../config/logger.js";

export function notFound(_req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(404, "NOT_FOUND", "Ruta no encontrada"));
}

// Devuelve JSON siempre (el default de Express es HTML y rompería el response.json() del cliente).
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.status).json({
      status: "error",
      code: err.code,
      message: err.message,
      ...(err.details !== undefined && { details: err.details }),
    });
    return;
  }

  // JSON mal formado en el body (lo lanza express.json antes de llegar a validate)
  if (typeof err === "object" && err !== null && (err as { type?: string }).type === "entity.parse.failed") {
    res.status(400).json({ status: "error", code: "INVALID_JSON", message: "El cuerpo no es JSON válido" });
    return;
  }

  // Un 500 nunca expone el detalle al cliente; queda en el log con el requestId.
  (req.log ?? logger).error({ err }, "error no controlado");
  res.status(500).json({ status: "error", code: "INTERNAL_ERROR", message: "Error interno del servidor" });
}
