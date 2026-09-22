import type { Request, Response } from "express";
import { validado } from "../middlewares/validate.js";
import {
  actualizarCotizacionReq,
  cambiarEstadoCotizacionReq,
  cotizacionIdReq,
  crearCotizacionReq,
  listarCotizacionesReq,
} from "../validations/cotizacion.validation.js";
import {
  actualizarCotizacion,
  cambiarEstadoCotizacion,
  crearCotizacion,
  listarCotizaciones,
  obtenerDetalleCotizacion,
} from "../services/cotizacion.service.js";

// req.user siempre existe: authenticate corre antes en el router.
const actor = (req: Request) => ({ id: req.user!.id, rol: req.user!.rol });

export async function listarCotizacionesController(req: Request, res: Response): Promise<void> {
  const { query } = validado(req, listarCotizacionesReq);
  const { data, meta } = await listarCotizaciones(query);
  res.json({ status: "ok", data, meta });
}

export async function crearCotizacionController(req: Request, res: Response): Promise<void> {
  const { body } = validado(req, crearCotizacionReq);
  res.status(201).json({ status: "ok", data: await crearCotizacion(actor(req), body) });
}

export async function detalleCotizacionController(req: Request, res: Response): Promise<void> {
  const { params } = validado(req, cotizacionIdReq);
  res.json({ status: "ok", data: await obtenerDetalleCotizacion(params.id) });
}

export async function actualizarCotizacionController(req: Request, res: Response): Promise<void> {
  const { params, body } = validado(req, actualizarCotizacionReq);
  res.json({ status: "ok", data: await actualizarCotizacion(actor(req), params.id, body) });
}

export async function cambiarEstadoCotizacionController(req: Request, res: Response): Promise<void> {
  const { params, body } = validado(req, cambiarEstadoCotizacionReq);
  res.json({ status: "ok", data: await cambiarEstadoCotizacion(actor(req), params.id, body.estado) });
}
