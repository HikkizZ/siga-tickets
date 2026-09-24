import type { Request, Response } from "express";
import { validado } from "../middlewares/validate.js";
import {
  actualizarPlanSlaReq,
  crearFeriadoReq,
  crearPlanSlaReq,
  eliminarFeriadoReq,
  eliminarPlanSlaReq,
} from "../validations/sla.validation.js";
import { crearFeriado, eliminarFeriado, listarFeriados } from "../services/feriado.service.js";
import { actualizarPlanSla, crearPlanSla, eliminarPlanSla, listarPlanesSla } from "../services/slaPlan.service.js";

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

export async function listarPlanesSlaController(_req: Request, res: Response): Promise<void> {
  res.json({ status: "ok", data: await listarPlanesSla() });
}

export async function crearPlanSlaController(req: Request, res: Response): Promise<void> {
  const { body } = validado(req, crearPlanSlaReq);
  res.status(201).json({ status: "ok", data: await crearPlanSla(body) });
}

export async function actualizarPlanSlaController(req: Request, res: Response): Promise<void> {
  const { params, body } = validado(req, actualizarPlanSlaReq);
  res.json({ status: "ok", data: await actualizarPlanSla(params.id, body) });
}

export async function eliminarPlanSlaController(req: Request, res: Response): Promise<void> {
  const { params } = validado(req, eliminarPlanSlaReq);
  await eliminarPlanSla(params.id);
  res.json({ status: "ok", data: null });
}
