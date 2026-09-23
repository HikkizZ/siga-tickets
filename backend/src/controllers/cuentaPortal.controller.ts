import type { Request, Response } from "express";
import { archivosDe, exigirCaptcha } from "./portal.controller.js";
import { validado } from "../middlewares/validate.js";
import {
  detalleTicketCuentaPortal,
  loginCuentaPortal,
  misTicketsCuentaPortal,
  registrarCuentaPortal,
  responderTicketCuentaPortal,
} from "../services/cuentaPortal.service.js";
import {
  loginCuentaPortalReq,
  mensajeCuentaPortalReq,
  misTicketsCuentaPortalReq,
  numeroTicketCuentaPortalReq,
  registroCuentaPortalReq,
} from "../validations/cuentaPortal.validation.js";

export async function registroCuentaPortalController(req: Request, res: Response): Promise<void> {
  const { body } = validado(req, registroCuentaPortalReq);
  await exigirCaptcha(body.captchaToken);
  const data = await registrarCuentaPortal({ email: body.email, password: body.password, nombre: body.nombre });
  res.status(201).json({ status: "ok", data });
}

export async function loginCuentaPortalController(req: Request, res: Response): Promise<void> {
  const { body } = validado(req, loginCuentaPortalReq);
  await exigirCaptcha(body.captchaToken);
  const data = await loginCuentaPortal(body.email, body.password);
  res.json({ status: "ok", data });
}

export async function misTicketsCuentaPortalController(req: Request, res: Response): Promise<void> {
  const { query } = validado(req, misTicketsCuentaPortalReq);
  const { data, meta } = await misTicketsCuentaPortal(req.portalCuenta!.email, query.page, query.perPage);
  res.json({ status: "ok", data, meta });
}

export async function detalleTicketCuentaPortalController(req: Request, res: Response): Promise<void> {
  const { params } = validado(req, numeroTicketCuentaPortalReq);
  const data = await detalleTicketCuentaPortal(params.numero, req.portalCuenta!.email);
  res.json({ status: "ok", data });
}

export async function mensajeCuentaPortalController(req: Request, res: Response): Promise<void> {
  const { params, body } = validado(req, mensajeCuentaPortalReq);
  const data = await responderTicketCuentaPortal(params.numero, req.portalCuenta!.email, {
    cuerpo: body.cuerpo,
    archivos: archivosDe(req),
  });
  res.status(201).json({ status: "ok", data });
}
