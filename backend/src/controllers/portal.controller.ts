import { pipeline } from "node:stream/promises";
import type { Request, Response } from "express";
import { AppError } from "../errors/AppError.js";
import { validado } from "../middlewares/validate.js";
import { captcha } from "../security/index.js";
import { abrirAdjuntoPortal, subirAdjuntoPortal } from "../services/portal.adjunto.service.js";
import { crearMensajePortal } from "../services/portal.mensaje.service.js";
import { seguimientoPortal } from "../services/portal.seguimiento.service.js";
import { crearTicketPublico, obtenerTicketPortal } from "../services/portal.service.js";
import {
  crearMensajePublicoReq,
  crearTicketPublicoReq,
  descargarAdjuntoPublicoReq,
  seguimientoPublicoReq,
} from "../validations/portal.validation.js";

// Los endpoints públicos de escritura llaman a esta interfaz, nunca a un proveedor concreto
// (NoopCaptcha hoy aprueba cualquier token no vacío; Zod ya exige que no venga vacío).
async function exigirCaptcha(token: string): Promise<void> {
  const ok = await captcha.verificar(token);
  if (!ok) throw new AppError(400, "CAPTCHA_INVALIDO", "No pudimos verificar que eres una persona");
}

function archivosDe(req: Request): Array<{ originalname: string; mimetype: string; buffer: Buffer }> {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  return files.map((f) => ({ originalname: f.originalname, mimetype: f.mimetype, buffer: f.buffer }));
}

export async function crearTicketPublicoController(req: Request, res: Response): Promise<void> {
  const { body } = validado(req, crearTicketPublicoReq);
  await exigirCaptcha(body.captchaToken);
  const data = await crearTicketPublico({
    nombre: body.nombre,
    correo: body.correo,
    empresa: body.empresa,
    asunto: body.asunto,
    descripcion: body.descripcion,
    prioridad: body.prioridad,
    archivos: archivosDe(req),
  });
  res.status(201).json({ status: "ok", data });
}

export async function seguimientoPublicoController(req: Request, res: Response): Promise<void> {
  const { body } = validado(req, seguimientoPublicoReq);
  await exigirCaptcha(body.captchaToken);
  const data = await seguimientoPortal(body.numero, body.email);
  res.json({ status: "ok", data });
}

export async function obtenerTicketPortalController(req: Request, res: Response): Promise<void> {
  res.json({ status: "ok", data: await obtenerTicketPortal(req.portal!.ticketId) });
}

export async function crearMensajePublicoController(req: Request, res: Response): Promise<void> {
  const { body } = validado(req, crearMensajePublicoReq);
  const data = await crearMensajePortal(req.portal!.ticketId, { cuerpo: body.cuerpo, archivos: archivosDe(req) });
  res.status(201).json({ status: "ok", data });
}

export async function subirAdjuntoPublicoController(req: Request, res: Response): Promise<void> {
  if (!req.file) throw new AppError(400, "ADJUNTO_INVALIDO", "Falta el archivo (campo 'archivo')");
  const data = await subirAdjuntoPortal(req.portal!.ticketId, {
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    buffer: req.file.buffer,
  });
  res.status(201).json({ status: "ok", data });
}

export async function descargarAdjuntoPublicoController(req: Request, res: Response): Promise<void> {
  const { params } = validado(req, descargarAdjuntoPublicoReq);
  const { adjunto, stream } = await abrirAdjuntoPortal(req.portal!.ticketId, params.id);

  res.attachment(adjunto.nombre);
  res.setHeader("Content-Type", adjunto.mime);
  res.setHeader("Content-Length", String(adjunto.tamanoBytes));
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "sandbox");
  res.setHeader("Cache-Control", "private, no-store");
  await pipeline(stream, res);
}
