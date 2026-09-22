import type { Request, Response } from "express";
import { validado } from "../middlewares/validate.js";
import { listarNotificacionesReq, notificacionIdReq } from "../validations/notificacion.validation.js";
import { listarNotificaciones, marcarLeida, marcarTodasLeidas, resumenNotificaciones } from "../services/notificacion.service.js";

export async function listarNotificacionesController(req: Request, res: Response): Promise<void> {
  const { query } = validado(req, listarNotificacionesReq);
  const { data, meta } = await listarNotificaciones(req.user!.id, query);
  res.json({ status: "ok", data, meta });
}

export async function resumenNotificacionesController(_req: Request, res: Response): Promise<void> {
  res.json({ status: "ok", data: await resumenNotificaciones() });
}

export async function marcarLeidaController(req: Request, res: Response): Promise<void> {
  const { params } = validado(req, notificacionIdReq);
  await marcarLeida(req.user!.id, params.id);
  res.json({ status: "ok", data: null });
}

export async function marcarTodasLeidasController(req: Request, res: Response): Promise<void> {
  await marcarTodasLeidas(req.user!.id);
  res.json({ status: "ok", data: null });
}
