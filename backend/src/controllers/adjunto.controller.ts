import { pipeline } from "node:stream/promises";
import type { Request, Response } from "express";
import { AppError } from "../errors/AppError.js";
import { validado } from "../middlewares/validate.js";
import { descargarAdjuntoReq, subirAdjuntoReq } from "../validations/adjunto.validation.js";
import { abrirAdjunto, subirAdjunto } from "../services/adjunto.service.js";

export async function subirAdjuntoController(req: Request, res: Response): Promise<void> {
  const { body } = validado(req, subirAdjuntoReq);
  if (!req.file) throw new AppError(400, "ADJUNTO_INVALIDO", "Falta el archivo (campo 'archivo')");
  const data = await subirAdjunto({ id: req.user!.id, rol: req.user!.rol }, body.entidadId, req.file);
  res.status(201).json({ status: "ok", data });
}

export async function descargarAdjuntoController(req: Request, res: Response): Promise<void> {
  const { params } = validado(req, descargarAdjuntoReq);
  const { adjunto, stream } = await abrirAdjunto(params.id);

  // attachment + nosniff + sandbox: el navegador nunca interpreta ni ejecuta lo descargado.
  res.attachment(adjunto.nombre); // Content-Disposition con el nombre saneado, correctamente codificado
  res.setHeader("Content-Type", adjunto.mime);
  res.setHeader("Content-Length", String(adjunto.tamanoBytes));
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "sandbox");
  res.setHeader("Cache-Control", "private, no-store");
  await pipeline(stream, res);
}
