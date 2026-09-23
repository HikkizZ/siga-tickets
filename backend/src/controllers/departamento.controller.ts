import type { Request, Response } from "express";
import { validado } from "../middlewares/validate.js";
import { actualizarDepartamentoReq, crearDepartamentoReq } from "../validations/departamento.validation.js";
import { actualizarDepartamento, crearDepartamento, listarDepartamentos } from "../services/departamento.service.js";

export async function listarDepartamentosController(_req: Request, res: Response): Promise<void> {
  res.json({ status: "ok", data: await listarDepartamentos() });
}

export async function crearDepartamentoController(req: Request, res: Response): Promise<void> {
  const { body } = validado(req, crearDepartamentoReq);
  res.status(201).json({ status: "ok", data: await crearDepartamento(body.nombre) });
}

export async function actualizarDepartamentoController(req: Request, res: Response): Promise<void> {
  const { params, body } = validado(req, actualizarDepartamentoReq);
  res.json({ status: "ok", data: await actualizarDepartamento(params.id, body) });
}
