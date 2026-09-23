import { Router } from "express";
import { Rol } from "../entities/enums.js";
import { authenticate } from "../middlewares/authenticate.js";
import { authorize } from "../middlewares/authorize.js";
import { validate } from "../middlewares/validate.js";
import { actualizarTemaAyudaReq, crearTemaAyudaReq } from "../validations/temaAyuda.validation.js";
import {
  actualizarTemaAyudaController,
  crearTemaAyudaController,
  listarTemasAyudaController,
} from "../controllers/temaAyuda.controller.js";

export const temaAyudaRouter = Router();

temaAyudaRouter.use(authenticate);

temaAyudaRouter.get("/", authorize(Rol.LECTURA), listarTemasAyudaController);
temaAyudaRouter.post("/", authorize(Rol.ADMIN), validate(crearTemaAyudaReq), crearTemaAyudaController);
temaAyudaRouter.patch("/:id", authorize(Rol.ADMIN), validate(actualizarTemaAyudaReq), actualizarTemaAyudaController);
