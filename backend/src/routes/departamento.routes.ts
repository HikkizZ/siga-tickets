import { Router } from "express";
import { Rol } from "../entities/enums.js";
import { authenticate } from "../middlewares/authenticate.js";
import { authorize } from "../middlewares/authorize.js";
import { validate } from "../middlewares/validate.js";
import { actualizarDepartamentoReq, crearDepartamentoReq } from "../validations/departamento.validation.js";
import {
  actualizarDepartamentoController,
  crearDepartamentoController,
  listarDepartamentosController,
} from "../controllers/departamento.controller.js";

export const departamentoRouter = Router();

departamentoRouter.use(authenticate);

departamentoRouter.get("/", authorize(Rol.LECTURA), listarDepartamentosController);
departamentoRouter.post("/", authorize(Rol.ADMIN), validate(crearDepartamentoReq), crearDepartamentoController);
departamentoRouter.patch("/:id", authorize(Rol.ADMIN), validate(actualizarDepartamentoReq), actualizarDepartamentoController);
