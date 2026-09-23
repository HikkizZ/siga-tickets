import type { Request, Response } from "express";
import { validado } from "../middlewares/validate.js";
import { dashboardReq } from "../validations/dashboard.validation.js";
import { obtenerDashboard } from "../services/dashboard.service.js";

export async function obtenerDashboardController(req: Request, res: Response): Promise<void> {
  const { query } = validado(req, dashboardReq);
  res.json({ status: "ok", data: await obtenerDashboard(query) });
}
