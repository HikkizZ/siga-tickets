import { Router } from "express";
import { Rol } from "../entities/enums.js";
import { authenticate } from "../middlewares/authenticate.js";
import { authorize } from "../middlewares/authorize.js";
import { validate } from "../middlewares/validate.js";
import { listarNotificacionesReq, notificacionIdReq } from "../validations/notificacion.validation.js";
import * as c from "../controllers/notificacion.controller.js";

export const notificacionRouter = Router();

notificacionRouter.use(authenticate);

// "cualquiera" (rol mínimo lectura, el más bajo de la jerarquía).
notificacionRouter.get("/", authorize(Rol.LECTURA), validate(listarNotificacionesReq), c.listarNotificacionesController);
notificacionRouter.get("/resumen", authorize(Rol.LECTURA), c.resumenNotificacionesController);
notificacionRouter.post("/leer-todas", authorize(Rol.LECTURA), c.marcarTodasLeidasController);
notificacionRouter.post("/:id/leer", authorize(Rol.LECTURA), validate(notificacionIdReq), c.marcarLeidaController);
