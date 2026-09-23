import type { Request, Response } from "express";
import { validado } from "../middlewares/validate.js";
import { actualizarTemaAyudaReq, crearTemaAyudaReq } from "../validations/temaAyuda.validation.js";
import { actualizarTemaAyuda, crearTemaAyuda, listarTemasAyuda } from "../services/temaAyuda.service.js";

export async function listarTemasAyudaController(_req: Request, res: Response): Promise<void> {
  res.json({ status: "ok", data: await listarTemasAyuda() });
}

export async function crearTemaAyudaController(req: Request, res: Response): Promise<void> {
  const { body } = validado(req, crearTemaAyudaReq);
  res.status(201).json({ status: "ok", data: await crearTemaAyuda(body) });
}

export async function actualizarTemaAyudaController(req: Request, res: Response): Promise<void> {
  const { params, body } = validado(req, actualizarTemaAyudaReq);
  res.json({ status: "ok", data: await actualizarTemaAyuda(params.id, body) });
}
