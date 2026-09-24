import { Router } from "express";
import { Rol } from "../entities/enums.js";
import { authenticate } from "../middlewares/authenticate.js";
import { authorize } from "../middlewares/authorize.js";
import { validate } from "../middlewares/validate.js";
import { actualizarPrioridadReq, crearPrioridadReq } from "../validations/prioridad.validation.js";
import {
  actualizarPrioridadController,
  crearPrioridadController,
  listarPrioridadesController,
} from "../controllers/prioridad.controller.js";

export const prioridadRouter = Router();

prioridadRouter.use(authenticate);

prioridadRouter.get("/", authorize(Rol.LECTURA), listarPrioridadesController);
prioridadRouter.post("/", authorize(Rol.ADMIN), validate(crearPrioridadReq), crearPrioridadController);
prioridadRouter.patch("/:id", authorize(Rol.ADMIN), validate(actualizarPrioridadReq), actualizarPrioridadController);
