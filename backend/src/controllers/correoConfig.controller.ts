import type { Request, Response } from "express";
import { validado } from "../middlewares/validate.js";
import { actualizarCorreoConfigReq } from "../validations/correoConfig.validation.js";
import { actualizarConfigCorreo, obtenerConfigCorreo } from "../services/correoConfig.service.js";

export async function obtenerCorreoConfigController(_req: Request, res: Response): Promise<void> {
  res.json({ status: "ok", data: await obtenerConfigCorreo() });
}

export async function actualizarCorreoConfigController(req: Request, res: Response): Promise<void> {
  const { body } = validado(req, actualizarCorreoConfigReq);
  // req.user siempre existe acá: la ruta pasa por authenticate antes que authorize(ADMIN).
  res.json({ status: "ok", data: await actualizarConfigCorreo(body, req.user!.id) });
}
