import { Router } from "express";
import { authenticatePortal } from "../middlewares/authenticatePortal.js";
import { limitarPorCampoBody, limitarPorIp } from "../middlewares/rateLimit.js";
import { subirArchivo, subirArchivosPublicoTicket } from "../middlewares/upload.js";
import { validate } from "../middlewares/validate.js";
import { crearMensajePublicoReq, crearTicketPublicoReq, descargarAdjuntoPublicoReq, seguimientoPublicoReq } from "../validations/portal.validation.js";
import * as c from "../controllers/portal.controller.js";

export const portalRouter = Router();

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;

// Límites del encargo (punto 4): 5/h/IP para crear ticket; 10/h/IP + 20/día/correo para
// seguimiento (el diseño exige explícitamente "por IP y por correo", no solo por IP); 30/h/IP para
// mensajes/adjuntos del portal (evita que un token de portal robado inunde el sistema).
const crearTicketLimiter = limitarPorIp({ windowMs: HORA_MS, limit: 5 });
const seguimientoIpLimiter = limitarPorIp({ windowMs: HORA_MS, limit: 10 });
const seguimientoEmailLimiter = limitarPorCampoBody("email", { windowMs: DIA_MS, limit: 20 });
const escrituraPortalLimiter = limitarPorIp({ windowMs: HORA_MS, limit: 30 });

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
