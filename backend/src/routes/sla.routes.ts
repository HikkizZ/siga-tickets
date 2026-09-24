import { Router } from "express";
import { Rol } from "../entities/enums.js";
import { authenticate } from "../middlewares/authenticate.js";
import { authorize } from "../middlewares/authorize.js";
import { validate } from "../middlewares/validate.js";
import {
  actualizarPlanSlaReq,
  crearFeriadoReq,
  crearPlanSlaReq,
  eliminarFeriadoReq,
  eliminarPlanSlaReq,
} from "../validations/sla.validation.js";
import * as c from "../controllers/sla.controller.js";

export const slaRouter = Router();

slaRouter.use(authenticate);

slaRouter.get("/feriados", authorize(Rol.LECTURA), c.listarFeriadosController);
slaRouter.post("/feriados", authorize(Rol.ADMIN), validate(crearFeriadoReq), c.crearFeriadoController);
slaRouter.delete("/feriados/:fecha", authorize(Rol.ADMIN), validate(eliminarFeriadoReq), c.eliminarFeriadoController);

// Fase B2: catálogo de Planes SLA (ver entities/PlanSla.ts). Fase C: es ahora el único sistema real
// de cálculo de SLA, vía Prioridad.planSlaId (sla_config y /sla/config se retiraron).
slaRouter.get("/planes", authorize(Rol.LECTURA), c.listarPlanesSlaController);
slaRouter.post("/planes", authorize(Rol.ADMIN), validate(crearPlanSlaReq), c.crearPlanSlaController);
slaRouter.patch("/planes/:id", authorize(Rol.ADMIN), validate(actualizarPlanSlaReq), c.actualizarPlanSlaController);
slaRouter.delete("/planes/:id", authorize(Rol.ADMIN), validate(eliminarPlanSlaReq), c.eliminarPlanSlaController);
