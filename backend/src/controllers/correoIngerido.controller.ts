import type { Request, Response } from "express";
import { validado } from "../middlewares/validate.js";
import { listarCorreosIngeridos, reprocesarCorreoIngerido } from "../services/correoIngerido.service.js";
import { listarCorreosIngeridosReq, reprocesarCorreoIngeridoReq } from "../validations/correoIngerido.validation.js";

export async function listarCorreosIngeridosController(req: Request, res: Response): Promise<void> {
  const { query } = validado(req, listarCorreosIngeridosReq);
  const { data, meta } = await listarCorreosIngeridos(query);
  res.json({ status: "ok", data, meta });
}

export async function reprocesarCorreoIngeridoController(req: Request, res: Response): Promise<void> {
  const { params } = validado(req, reprocesarCorreoIngeridoReq);
  res.json({ status: "ok", data: await reprocesarCorreoIngerido(params.id) });
}
