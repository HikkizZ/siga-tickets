import type { Request, Response } from "express";
import { validado } from "../middlewares/validate.js";
import { actualizarPrioridadReq, crearPrioridadReq } from "../validations/prioridad.validation.js";
import { actualizarPrioridad, crearPrioridad, listarPrioridades } from "../services/prioridad.service.js";

export async function listarPrioridadesController(_req: Request, res: Response): Promise<void> {
  res.json({ status: "ok", data: await listarPrioridades() });
}

export async function crearPrioridadController(req: Request, res: Response): Promise<void> {
  const { body } = validado(req, crearPrioridadReq);
  res.status(201).json({ status: "ok", data: await crearPrioridad(body) });
}

export async function actualizarPrioridadController(req: Request, res: Response): Promise<void> {
  const { params, body } = validado(req, actualizarPrioridadReq);
  res.json({ status: "ok", data: await actualizarPrioridad(params.id, body) });
}
