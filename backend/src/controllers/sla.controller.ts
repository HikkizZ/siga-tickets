import type { Request, Response } from "express";
import { validado } from "../middlewares/validate.js";
import { actualizarSlaConfigReq, crearFeriadoReq, eliminarFeriadoReq } from "../validations/sla.validation.js";
import { actualizarSlaConfig, obtenerSlaConfig } from "../services/sla.config.service.js";
import { crearFeriado, eliminarFeriado, listarFeriados } from "../services/feriado.service.js";

export async function obtenerSlaConfigController(_req: Request, res: Response): Promise<void> {
  res.json({ status: "ok", data: await obtenerSlaConfig() });
}

export async function actualizarSlaConfigController(req: Request, res: Response): Promise<void> {
  const { body } = validado(req, actualizarSlaConfigReq);
  res.json({ status: "ok", data: await actualizarSlaConfig(body.configs) });
}

export async function listarFeriadosController(_req: Request, res: Response): Promise<void> {
  res.json({ status: "ok", data: await listarFeriados() });
}

export async function crearFeriadoController(req: Request, res: Response): Promise<void> {
  const { body } = validado(req, crearFeriadoReq);
  res.status(201).json({ status: "ok", data: await crearFeriado(body) });
}

export async function eliminarFeriadoController(req: Request, res: Response): Promise<void> {
  const { params } = validado(req, eliminarFeriadoReq);
  await eliminarFeriado(params.fecha);
  res.json({ status: "ok", data: null });
}
