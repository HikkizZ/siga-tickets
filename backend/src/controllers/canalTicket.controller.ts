import type { Request, Response } from "express";
import { validado } from "../middlewares/validate.js";
import { actualizarCanalTicketReq, crearCanalTicketReq } from "../validations/canalTicket.validation.js";
import { actualizarCanalTicket, crearCanalTicket, listarCanalesTicket } from "../services/canalTicket.service.js";

export async function listarCanalesTicketController(_req: Request, res: Response): Promise<void> {
  res.json({ status: "ok", data: await listarCanalesTicket() });
}

export async function crearCanalTicketController(req: Request, res: Response): Promise<void> {
  const { body } = validado(req, crearCanalTicketReq);
  res.status(201).json({ status: "ok", data: await crearCanalTicket(body) });
}

export async function actualizarCanalTicketController(req: Request, res: Response): Promise<void> {
  const { params, body } = validado(req, actualizarCanalTicketReq);
  res.json({ status: "ok", data: await actualizarCanalTicket(params.id, body) });
}
