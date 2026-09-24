import { Router } from "express";
import { Rol } from "../entities/enums.js";
import { authenticate } from "../middlewares/authenticate.js";
import { authorize } from "../middlewares/authorize.js";
import { validate } from "../middlewares/validate.js";
import { actualizarCanalTicketReq, crearCanalTicketReq } from "../validations/canalTicket.validation.js";
import {
  actualizarCanalTicketController,
  crearCanalTicketController,
  listarCanalesTicketController,
} from "../controllers/canalTicket.controller.js";

// La URL usa "fuentes" (ver docs/api.md): es como el admin ve este catálogo en la Fase C. El
// nombre en código sigue siendo "canal" por continuidad con el resto (Ticket.canalId, etc.).
export const canalTicketRouter = Router();

canalTicketRouter.use(authenticate);

canalTicketRouter.get("/", authorize(Rol.LECTURA), listarCanalesTicketController);
canalTicketRouter.post("/", authorize(Rol.ADMIN), validate(crearCanalTicketReq), crearCanalTicketController);
canalTicketRouter.patch("/:id", authorize(Rol.ADMIN), validate(actualizarCanalTicketReq), actualizarCanalTicketController);
