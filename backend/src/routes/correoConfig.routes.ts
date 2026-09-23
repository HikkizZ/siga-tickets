import { Router } from "express";
import { Rol } from "../entities/enums.js";
import { authenticate } from "../middlewares/authenticate.js";
import { authorize } from "../middlewares/authorize.js";
import { validate } from "../middlewares/validate.js";
import { actualizarCorreoConfigReq, actualizarPlantillaCorreoReq } from "../validations/correoConfig.validation.js";
import * as c from "../controllers/correoConfig.controller.js";

export const correoConfigRouter = Router();

correoConfigRouter.use(authenticate);

correoConfigRouter.get("/config", authorize(Rol.LECTURA), c.obtenerCorreoConfigController);
correoConfigRouter.put("/config", authorize(Rol.ADMIN), validate(actualizarCorreoConfigReq), c.actualizarCorreoConfigController);

// Fase B2: plantillas de correo editables (ver entities/PlantillaCorreo.ts).
correoConfigRouter.get("/plantillas", authorize(Rol.LECTURA), c.listarPlantillasCorreoController);
correoConfigRouter.put(
  "/plantillas/:nombre",
  authorize(Rol.ADMIN),
  validate(actualizarPlantillaCorreoReq),
  c.actualizarPlantillaCorreoController,
);
