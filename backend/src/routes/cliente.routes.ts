import { Router } from "express";
import { Rol } from "../entities/enums.js";
import { authenticate } from "../middlewares/authenticate.js";
import { authorize } from "../middlewares/authorize.js";
import { validate } from "../middlewares/validate.js";
import { actualizarClienteReq, crearClienteReq } from "../validations/cliente.validation.js";
import {
  actualizarClienteController,
  crearClienteController,
  listarClientesController,
} from "../controllers/cliente.controller.js";

export const clienteRouter = Router();

clienteRouter.use(authenticate);

clienteRouter.get("/", authorize(Rol.LECTURA), listarClientesController);
clienteRouter.post("/", authorize(Rol.ADMIN), validate(crearClienteReq), crearClienteController);
clienteRouter.patch("/:id", authorize(Rol.ADMIN), validate(actualizarClienteReq), actualizarClienteController);
