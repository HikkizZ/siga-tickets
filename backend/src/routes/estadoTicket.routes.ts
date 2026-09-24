import { Router } from "express";
import { Rol } from "../entities/enums.js";
import { authenticate } from "../middlewares/authenticate.js";
import { authorize } from "../middlewares/authorize.js";
import { validate } from "../middlewares/validate.js";
import { actualizarEstadoTicketReq, crearEstadoTicketReq } from "../validations/estadoTicket.validation.js";
import {
  actualizarEstadoTicketController,
  crearEstadoTicketController,
  listarEstadosTicketController,
} from "../controllers/estadoTicket.controller.js";

export const estadoTicketRouter = Router();

estadoTicketRouter.use(authenticate);

estadoTicketRouter.get("/", authorize(Rol.LECTURA), listarEstadosTicketController);
estadoTicketRouter.post("/", authorize(Rol.ADMIN), validate(crearEstadoTicketReq), crearEstadoTicketController);
estadoTicketRouter.patch("/:id", authorize(Rol.ADMIN), validate(actualizarEstadoTicketReq), actualizarEstadoTicketController);
