import type { Request, Response } from "express";
import { validado } from "../middlewares/validate.js";
import {
  actualizarTicketReq,
  cambiarEstadoTicketReq,
  convertirATicketOtReq,
  crearMensajeReq,
  crearTicketReq,
  derivarTicketReq,
  desvincularOtReq,
  listarTicketsReq,
  ticketIdReq,
  vincularOtReq,
} from "../validations/ticket.validation.js";
import {
  actualizarTicket,
  cambiarEstadoTicket,
  crearTicket,
  listarEventosTicket,
  listarTickets,
  obtenerDetalleTicket,
} from "../services/ticket.service.js";
import { derivarTicket, tomarTicket } from "../services/ticket.derivacion.service.js";
import { crearMensaje } from "../services/ticket.mensaje.service.js";
import { convertirATicketOt, desvincularOt, vincularOtExistente } from "../services/ticket.conversion.service.js";

// req.user siempre existe: authenticate corre antes en el router.
const actor = (req: Request) => ({ id: req.user!.id, rol: req.user!.rol });

export async function listarTicketsController(req: Request, res: Response): Promise<void> {
  const { query } = validado(req, listarTicketsReq);
  const { data, meta } = await listarTickets(query, req.user!.id);
  res.json({ status: "ok", data, meta });
}

export async function crearTicketController(req: Request, res: Response): Promise<void> {
  const { body } = validado(req, crearTicketReq);
  res.status(201).json({ status: "ok", data: await crearTicket(actor(req), body) });
}

export async function detalleTicketController(req: Request, res: Response): Promise<void> {
  const { params } = validado(req, ticketIdReq);
  res.json({ status: "ok", data: await obtenerDetalleTicket(params.id) });
}

export async function actualizarTicketController(req: Request, res: Response): Promise<void> {
  const { params, body } = validado(req, actualizarTicketReq);
  res.json({ status: "ok", data: await actualizarTicket(actor(req), params.id, body) });
}

export async function cambiarEstadoTicketController(req: Request, res: Response): Promise<void> {
  const { params, body } = validado(req, cambiarEstadoTicketReq);
  res.json({ status: "ok", data: await cambiarEstadoTicket(actor(req), params.id, body.estado) });
}

export async function tomarTicketController(req: Request, res: Response): Promise<void> {
  const { params } = validado(req, ticketIdReq);
  res.json({ status: "ok", data: await tomarTicket(actor(req), params.id) });
}

export async function derivarTicketController(req: Request, res: Response): Promise<void> {
  const { params, body } = validado(req, derivarTicketReq);
  res.json({ status: "ok", data: await derivarTicket(actor(req), params.id, body) });
}

export async function crearMensajeController(req: Request, res: Response): Promise<void> {
  const { params, body } = validado(req, crearMensajeReq);
  res.status(201).json({ status: "ok", data: await crearMensaje(actor(req), params.id, body) });
}

export async function convertirATicketOtController(req: Request, res: Response): Promise<void> {
  const { params, body } = validado(req, convertirATicketOtReq);
  res.status(201).json({ status: "ok", data: await convertirATicketOt(actor(req), params.id, body) });
}

export async function vincularOtController(req: Request, res: Response): Promise<void> {
  const { params, body } = validado(req, vincularOtReq);
  res.status(201).json({ status: "ok", data: await vincularOtExistente(actor(req), params.id, body.otId) });
}

export async function desvincularOtController(req: Request, res: Response): Promise<void> {
  const { params } = validado(req, desvincularOtReq);
  await desvincularOt(actor(req), params.id, params.otId);
  res.json({ status: "ok", data: null });
}

export async function eventosTicketController(req: Request, res: Response): Promise<void> {
  const { params } = validado(req, ticketIdReq);
  res.json({ status: "ok", data: await listarEventosTicket(params.id) });
}
