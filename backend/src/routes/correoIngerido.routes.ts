import { Router } from "express";
import * as c from "../controllers/correoIngerido.controller.js";
import { Rol } from "../entities/enums.js";
import { authenticate } from "../middlewares/authenticate.js";
import { authorize } from "../middlewares/authorize.js";
import { validate } from "../middlewares/validate.js";
import { listarCorreosIngeridosReq, reprocesarCorreoIngeridoReq } from "../validations/correoIngerido.validation.js";

// Fase 6: solo admin (fila "reprocesar correo" del RBAC, sección 6 del diseño).
export const correoIngeridoRouter = Router();

correoIngeridoRouter.use(authenticate);
correoIngeridoRouter.use(authorize(Rol.ADMIN));

correoIngeridoRouter.get("/", validate(listarCorreosIngeridosReq), c.listarCorreosIngeridosController);
correoIngeridoRouter.post("/:id/reprocesar", validate(reprocesarCorreoIngeridoReq), c.reprocesarCorreoIngeridoController);
