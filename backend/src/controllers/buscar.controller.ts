import type { Request, Response } from "express";
import { validado } from "../middlewares/validate.js";
import { buscarReq } from "../validations/buscar.validation.js";
import { buscarGlobal } from "../services/buscar.service.js";

export async function buscarController(req: Request, res: Response): Promise<void> {
  const { query } = validado(req, buscarReq);
  res.json({ status: "ok", data: await buscarGlobal(query.q) });
}
