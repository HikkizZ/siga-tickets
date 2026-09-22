import type { Request, Response } from "express";
import { validado } from "../middlewares/validate.js";
import {
  actualizarEtapaReq,
  actualizarOtReq,
  agregarColaboradorReq,
  cambiarEstadoReq,
  crearComentarioReq,
  crearEtapaReq,
  crearHoraReq,
  crearOtReq,
  derivarReq,
  eliminarEtapaReq,
  eliminarHoraReq,
  kanbanReq,
  listarOtsReq,
  otIdReq,
  quitarColaboradorReq,
} from "../validations/ot.validation.js";
import { actualizarOt, cambiarEstadoOt, crearOt, kanbanOts, listarOts, obtenerDetalleOt } from "../services/ot.service.js";
import { derivarOt } from "../services/ot.derivacion.service.js";
import { agregarColaborador, quitarColaborador } from "../services/ot.colaborador.service.js";
import { vincularCotizacion } from "../services/cotizacion.service.js";
import { vincularCotizacionReq } from "../validations/cotizacion.validation.js";
import {
  actualizarEtapa,
  crearComentario,
  crearEtapa,
  eliminarEtapa,
  eliminarHoras,
  listarComentarios,
  listarEtapas,
  listarHoras,
  registrarHoras,
} from "../services/ot.subrecursos.service.js";

// req.user siempre existe: authenticate corre antes en el router.
const actor = (req: Request) => ({ id: req.user!.id, rol: req.user!.rol });

export async function listarOtsController(req: Request, res: Response): Promise<void> {
  const { query } = validado(req, listarOtsReq);
  const { data, meta } = await listarOts(query, req.user!.id);
  res.json({ status: "ok", data, meta });
}

export async function kanbanController(req: Request, res: Response): Promise<void> {
  const { query } = validado(req, kanbanReq);
  res.json({ status: "ok", data: await kanbanOts(query, req.user!.id) });
}

export async function crearOtController(req: Request, res: Response): Promise<void> {
  const { body } = validado(req, crearOtReq);
  res.status(201).json({ status: "ok", data: await crearOt(actor(req), body) });
}

export async function detalleOtController(req: Request, res: Response): Promise<void> {
  const { params } = validado(req, otIdReq);
  res.json({ status: "ok", data: await obtenerDetalleOt(params.id) });
}

export async function actualizarOtController(req: Request, res: Response): Promise<void> {
  const { params, body } = validado(req, actualizarOtReq);
  res.json({ status: "ok", data: await actualizarOt(actor(req), params.id, body) });
}

export async function cambiarEstadoController(req: Request, res: Response): Promise<void> {
  const { params, body } = validado(req, cambiarEstadoReq);
  res.json({ status: "ok", data: await cambiarEstadoOt(actor(req), params.id, body.estado) });
}

export async function derivarController(req: Request, res: Response): Promise<void> {
  const { params, body } = validado(req, derivarReq);
  res.json({ status: "ok", data: await derivarOt(actor(req), params.id, body) });
}

export async function agregarColaboradorController(req: Request, res: Response): Promise<void> {
  const { params, body } = validado(req, agregarColaboradorReq);
  res.status(201).json({ status: "ok", data: await agregarColaborador(actor(req), params.id, body.usuarioId) });
}

export async function quitarColaboradorController(req: Request, res: Response): Promise<void> {
  const { params } = validado(req, quitarColaboradorReq);
  await quitarColaborador(actor(req), params.id, params.usuarioId);
  res.json({ status: "ok", data: null });
}

export async function vincularCotizacionController(req: Request, res: Response): Promise<void> {
  const { params, body } = validado(req, vincularCotizacionReq);
  res.json({ status: "ok", data: await vincularCotizacion(actor(req), params.id, body.cotizacionId) });
}

export async function listarComentariosController(req: Request, res: Response): Promise<void> {
  const { params } = validado(req, otIdReq);
  res.json({ status: "ok", data: await listarComentarios(params.id) });
}

export async function crearComentarioController(req: Request, res: Response): Promise<void> {
  const { params, body } = validado(req, crearComentarioReq);
  res.status(201).json({ status: "ok", data: await crearComentario(actor(req), params.id, body) });
}

export async function listarHorasController(req: Request, res: Response): Promise<void> {
  const { params } = validado(req, otIdReq);
  res.json({ status: "ok", data: await listarHoras(params.id) });
}

export async function registrarHorasController(req: Request, res: Response): Promise<void> {
  const { params, body } = validado(req, crearHoraReq);
  res.status(201).json({ status: "ok", data: await registrarHoras(actor(req), params.id, body) });
}

export async function eliminarHorasController(req: Request, res: Response): Promise<void> {
  const { params } = validado(req, eliminarHoraReq);
  res.json({ status: "ok", data: await eliminarHoras(actor(req), params.id, params.horaId) });
}

export async function listarEtapasController(req: Request, res: Response): Promise<void> {
  const { params } = validado(req, otIdReq);
  res.json({ status: "ok", data: await listarEtapas(params.id) });
}

export async function crearEtapaController(req: Request, res: Response): Promise<void> {
  const { params, body } = validado(req, crearEtapaReq);
  res.status(201).json({ status: "ok", data: await crearEtapa(actor(req), params.id, body) });
}

export async function actualizarEtapaController(req: Request, res: Response): Promise<void> {
  const { params, body } = validado(req, actualizarEtapaReq);
  res.json({ status: "ok", data: await actualizarEtapa(actor(req), params.id, params.etapaId, body) });
}

export async function eliminarEtapaController(req: Request, res: Response): Promise<void> {
  const { params } = validado(req, eliminarEtapaReq);
  await eliminarEtapa(actor(req), params.id, params.etapaId);
  res.json({ status: "ok", data: null });
}
