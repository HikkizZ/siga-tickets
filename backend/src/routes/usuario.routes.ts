import { Router } from "express";
import { Rol } from "../entities/enums.js";
import { authenticate } from "../middlewares/authenticate.js";
import { authorize } from "../middlewares/authorize.js";
import { validate } from "../middlewares/validate.js";
import { actualizarUsuarioReq, crearUsuarioReq } from "../validations/usuario.validation.js";
import {
  actualizarUsuarioController,
  crearUsuarioController,
  listarUsuariosController,
} from "../controllers/usuario.controller.js";

export const usuarioRouter = Router();

// Todo /usuarios es solo admin.
usuarioRouter.use(authenticate, authorize(Rol.ADMIN));

usuarioRouter.get("/", listarUsuariosController);
usuarioRouter.post("/", validate(crearUsuarioReq), crearUsuarioController);
usuarioRouter.patch("/:id", validate(actualizarUsuarioReq), actualizarUsuarioController);
