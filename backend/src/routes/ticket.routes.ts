import { Router } from "express";
import { Rol } from "../entities/enums.js";
import { authenticate } from "../middlewares/authenticate.js";
import { authorize } from "../middlewares/authorize.js";
import { validate } from "../middlewares/validate.js";
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
import * as c from "../controllers/ticket.controller.js";

export const ticketRouter = Router();

ticketRouter.use(authenticate);

// Rol grueso aquí; el permiso por fila (responsable actual, sin colaborador) lo aplica el
// servicio con ticket.policy.
ticketRouter.get("/", authorize(Rol.LECTURA), validate(listarTicketsReq), c.listarTicketsController);
ticketRouter.post("/", authorize(Rol.TECNICO), validate(crearTicketReq), c.crearTicketController);
ticketRouter.get("/:id", authorize(Rol.LECTURA), validate(ticketIdReq), c.detalleTicketController);
ticketRouter.patch("/:id", authorize(Rol.TECNICO), validate(actualizarTicketReq), c.actualizarTicketController);
ticketRouter.post("/:id/estado", authorize(Rol.TECNICO), validate(cambiarEstadoTicketReq), c.cambiarEstadoTicketController);
ticketRouter.post("/:id/tomar", authorize(Rol.TECNICO), validate(ticketIdReq), c.tomarTicketController);
ticketRouter.post("/:id/mensajes", authorize(Rol.TECNICO), validate(crearMensajeReq), c.crearMensajeController);
ticketRouter.post("/:id/derivar", authorize(Rol.TECNICO), validate(derivarTicketReq), c.derivarTicketController);

// Convertir/vincular: solo gestion/admin, sin excepción por fila (ver ticket.policy.ts).
ticketRouter.post("/:id/convertir-a-ot", authorize(Rol.GESTION), validate(convertirATicketOtReq), c.convertirATicketOtController);
ticketRouter.post("/:id/ots", authorize(Rol.GESTION), validate(vincularOtReq), c.vincularOtController);
ticketRouter.delete("/:id/ots/:otId", authorize(Rol.GESTION), validate(desvincularOtReq), c.desvincularOtController);

ticketRouter.get("/:id/eventos", authorize(Rol.LECTURA), validate(ticketIdReq), c.eventosTicketController);
