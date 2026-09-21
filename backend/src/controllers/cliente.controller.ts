import type { Request, Response } from "express";
import { validado } from "../middlewares/validate.js";
import { actualizarClienteReq, crearClienteReq } from "../validations/cliente.validation.js";
import { actualizarCliente, crearCliente, listarClientes } from "../services/cliente.service.js";

export async function listarClientesController(_req: Request, res: Response): Promise<void> {
  res.json({ status: "ok", data: await listarClientes() });
}

export async function crearClienteController(req: Request, res: Response): Promise<void> {
  const { body } = validado(req, crearClienteReq);
  res.status(201).json({ status: "ok", data: await crearCliente(body.nombre) });
}

export async function actualizarClienteController(req: Request, res: Response): Promise<void> {
  const { params, body } = validado(req, actualizarClienteReq);
  res.json({ status: "ok", data: await actualizarCliente(params.id, body) });
}
