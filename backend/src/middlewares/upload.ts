import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { AppError } from "../errors/AppError.js";

const MAX_ARCHIVO = 10 * 1024 * 1024;

// En memoria: el tope es 10 MB por archivo y el servicio necesita el buffer completo para
// calcular el sha256 (nombre en disco) y escanearlo antes de escribir nada.
const parser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ARCHIVO, files: 1, fields: 5, fieldSize: 1024, parts: 8 },
  // El nombre se sanea en el servicio (aquí llega tal cual, con posible ruta) y viene en UTF-8.
  preservePath: true,
  defParamCharset: "utf8",
}).single("archivo");

// Traduce los errores de multer/busboy a AppError para que salgan con el envelope habitual.
export function subirArchivo(req: Request, res: Response, next: NextFunction): void {
  parser(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return next(new AppError(413, "ADJUNTO_MUY_GRANDE", "El archivo supera 10 MB"));
    }
    next(new AppError(400, "ADJUNTO_INVALIDO", "Solicitud multipart inválida (campo 'archivo' y un solo archivo)"));
  });
}

const MAX_ARCHIVOS_PORTAL = 10;

// Fase 5 (portal público): crear un ticket o publicar un mensaje admite varios adjuntos opcionales
// en un solo campo ("adjuntos"), además de los campos de texto del formulario (más numerosos que
// en el multipart interno: nombre, correo, empresa, asunto, descripcion, prioridad, captchaToken).
// El tope de 10 archivos es un resguardo técnico (evitar un multipart absurdo), no una regla de
// negocio: la cuota real de 25 MB por ticket la aplica el servicio (verificarCuotaAdjunto).
const parserPublico = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ARCHIVO, files: MAX_ARCHIVOS_PORTAL, fields: 10, fieldSize: 100 * 1024, parts: 30 },
  preservePath: true,
  defParamCharset: "utf8",
}).array("adjuntos", MAX_ARCHIVOS_PORTAL);

export function subirArchivosPublicoTicket(req: Request, res: Response, next: NextFunction): void {
  parserPublico(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return next(new AppError(413, "ADJUNTO_MUY_GRANDE", "Un archivo supera 10 MB"));
    }
    next(new AppError(400, "ADJUNTO_INVALIDO", "Solicitud multipart inválida"));
  });
}
