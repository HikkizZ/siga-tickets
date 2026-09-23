import { Router } from "express";
import { Rol } from "../entities/enums.js";
import { authenticate } from "../middlewares/authenticate.js";
import { authorize } from "../middlewares/authorize.js";
import { validate } from "../middlewares/validate.js";
import { dashboardReq } from "../validations/dashboard.validation.js";
import { obtenerDashboardController } from "../controllers/dashboard.controller.js";

export const dashboardRouter = Router();

dashboardRouter.use(authenticate);
dashboardRouter.get("/", authorize(Rol.LECTURA), validate(dashboardReq), obtenerDashboardController);
