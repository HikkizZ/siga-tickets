import type { Request, Response } from "express";
import { validado } from "../middlewares/validate.js";
import { actualizarUsuarioReq, crearUsuarioReq } from "../validations/usuario.validation.js";
import { actualizarUsuario, crearUsuario, listarUsuarios } from "../services/usuario.service.js";

export async function listarUsuariosController(_req: Request, res: Response): Promise<void> {
  res.json({ status: "ok", data: await listarUsuarios() });
}

export async function crearUsuarioController(req: Request, res: Response): Promise<void> {
  const { body } = validado(req, crearUsuarioReq);
  res.status(201).json({ status: "ok", data: await crearUsuario(body) });
}

export async function actualizarUsuarioController(req: Request, res: Response): Promise<void> {
  const { params, body } = validado(req, actualizarUsuarioReq);
  res.json({ status: "ok", data: await actualizarUsuario(req.user!.id, params.id, body) });
}
