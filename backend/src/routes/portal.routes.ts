import { Router } from "express";
import { authenticatePortal } from "../middlewares/authenticatePortal.js";
import { authenticatePortalCuenta } from "../middlewares/authenticatePortalCuenta.js";
import { limitarPorCampoBody, limitarPorIp } from "../middlewares/rateLimit.js";
import { subirArchivo, subirArchivosPublicoTicket } from "../middlewares/upload.js";
import { validate } from "../middlewares/validate.js";
import { crearMensajePublicoReq, crearTicketPublicoReq, descargarAdjuntoPublicoReq, seguimientoPublicoReq } from "../validations/portal.validation.js";
import {
  loginCuentaPortalReq,
  mensajeCuentaPortalReq,
  misTicketsCuentaPortalReq,
  numeroTicketCuentaPortalReq,
  registroCuentaPortalReq,
} from "../validations/cuentaPortal.validation.js";
import * as c from "../controllers/portal.controller.js";
import * as cc from "../controllers/cuentaPortal.controller.js";

export const portalRouter = Router();

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;
const QUINCE_MIN_MS = 15 * 60 * 1000;

// Límites del encargo (punto 4): 5/h/IP para crear ticket; 10/h/IP + 20/día/correo para
// seguimiento (el diseño exige explícitamente "por IP y por correo", no solo por IP); 30/h/IP para
// mensajes/adjuntos del portal (evita que un token de portal robado inunde el sistema).
const crearTicketLimiter = limitarPorIp({ windowMs: HORA_MS, limit: 5 });
const seguimientoIpLimiter = limitarPorIp({ windowMs: HORA_MS, limit: 10 });
const seguimientoEmailLimiter = limitarPorCampoBody("email", { windowMs: DIA_MS, limit: 20 });
const escrituraPortalLimiter = limitarPorIp({ windowMs: HORA_MS, limit: 30 });

// Fase D: cuentas de cliente. Registro con el mismo límite que crear ticket (5/h/IP); login con
// el mismo criterio que el login interno (5 intentos/15 min/IP, ver auth/loginRateLimiter.ts).
// Limitadores propios (no comparten instancia con los de arriba) para que golpear una ruta no
// consuma el cupo de la otra desde la misma IP.
const registroCuentaLimiter = limitarPorIp({ windowMs: HORA_MS, limit: 5 });
const loginCuentaLimiter = limitarPorIp({ windowMs: QUINCE_MIN_MS, limit: 5 });

// Sin JWT interno: nadie tiene uno todavía en estos dos.
portalRouter.post(
  "/tickets",
  crearTicketLimiter,
  subirArchivosPublicoTicket,
  validate(crearTicketPublicoReq),
  c.crearTicketPublicoController,
);
portalRouter.post(
  "/tickets/seguimiento",
  seguimientoIpLimiter,
  seguimientoEmailLimiter,
  validate(seguimientoPublicoReq),
  c.seguimientoPublicoController,
);

// Con JWT de portal (scope:'portal', 15 min).
portalRouter.get("/ticket", authenticatePortal, c.obtenerTicketPortalController);
portalRouter.post(
  "/ticket/mensajes",
  authenticatePortal,
  escrituraPortalLimiter,
  subirArchivosPublicoTicket,
  validate(crearMensajePublicoReq),
  c.crearMensajePublicoController,
);
portalRouter.post("/adjuntos", authenticatePortal, escrituraPortalLimiter, subirArchivo, c.subirAdjuntoPublicoController);
portalRouter.get("/adjuntos/:id/descargar", authenticatePortal, validate(descargarAdjuntoPublicoReq), c.descargarAdjuntoPublicoController);

// Fase D: cuentas de cliente con login persistente, SUMADAS al flujo de arriba (número+correo,
// token de 15 min) — no lo reemplazan. Quien no quiera crear cuenta sigue usando
// /tickets/seguimiento y /ticket tal cual.
portalRouter.post("/cuentas/registro", registroCuentaLimiter, validate(registroCuentaPortalReq), cc.registroCuentaPortalController);
portalRouter.post("/cuentas/login", loginCuentaLimiter, validate(loginCuentaPortalReq), cc.loginCuentaPortalController);

// Con JWT de cuenta de portal (scope:'portal-cuenta', 7 días).
portalRouter.get("/cuentas/mis-tickets", authenticatePortalCuenta, validate(misTicketsCuentaPortalReq), cc.misTicketsCuentaPortalController);
portalRouter.get(
  "/cuentas/tickets/:numero",
  authenticatePortalCuenta,
  validate(numeroTicketCuentaPortalReq),
  cc.detalleTicketCuentaPortalController,
);
portalRouter.post(
  "/cuentas/tickets/:numero/mensajes",
  authenticatePortalCuenta,
  escrituraPortalLimiter,
  subirArchivosPublicoTicket,
  validate(mensajeCuentaPortalReq),
  cc.mensajeCuentaPortalController,
);
