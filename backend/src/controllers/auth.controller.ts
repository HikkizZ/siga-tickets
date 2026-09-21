import type { Request, Response } from "express";
import { validado } from "../middlewares/validate.js";
import { cambiarPasswordReq, loginReq } from "../validations/auth.validation.js";
import { cambiarPassword, login, obtenerPerfil } from "../services/auth.service.js";

export async function loginController(req: Request, res: Response): Promise<void> {
  const { body } = validado(req, loginReq);
  const { token, user } = await login(body.username, body.password);
  res.json({ status: "ok", data: { token, user } });
}

export async function meController(req: Request, res: Response): Promise<void> {
  const user = await obtenerPerfil(req.user!.id);
  res.json({ status: "ok", data: { user } });
}

export async function cambiarPasswordController(req: Request, res: Response): Promise<void> {
  const { body } = validado(req, cambiarPasswordReq);
  await cambiarPassword(req.user!.id, body.currentPassword, body.newPassword);
  res.json({ status: "ok", data: null });
}
