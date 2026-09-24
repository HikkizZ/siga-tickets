import type { Request, Response } from "express";
import { validado } from "../middlewares/validate.js";
import { actualizarEstadoTicketReq, crearEstadoTicketReq } from "../validations/estadoTicket.validation.js";
import { actualizarEstadoTicket, crearEstadoTicket, listarEstadosTicket } from "../services/estadoTicket.service.js";

export async function listarEstadosTicketController(_req: Request, res: Response): Promise<void> {
  res.json({ status: "ok", data: await listarEstadosTicket() });
}

export async function crearEstadoTicketController(req: Request, res: Response): Promise<void> {
  const { body } = validado(req, crearEstadoTicketReq);
  res.status(201).json({ status: "ok", data: await crearEstadoTicket(body) });
}

export async function actualizarEstadoTicketController(req: Request, res: Response): Promise<void> {
  const { params, body } = validado(req, actualizarEstadoTicketReq);
  res.json({ status: "ok", data: await actualizarEstadoTicket(params.id, body) });
}
