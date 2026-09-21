import { Router } from "express";
import { Rol } from "../entities/enums.js";
import { authenticate } from "../middlewares/authenticate.js";
import { authorize } from "../middlewares/authorize.js";
import { subirArchivo } from "../middlewares/upload.js";
import { validate } from "../middlewares/validate.js";
import { descargarAdjuntoReq, subirAdjuntoReq } from "../validations/adjunto.validation.js";
import { descargarAdjuntoController, subirAdjuntoController } from "../controllers/adjunto.controller.js";

export const adjuntoRouter = Router();

adjuntoRouter.use(authenticate);

// multer va antes de validate: los campos de texto del multipart solo existen en req.body tras parsearlo.
adjuntoRouter.post("/", authorize(Rol.TECNICO), subirArchivo, validate(subirAdjuntoReq), subirAdjuntoController);
adjuntoRouter.get("/:id/descargar", authorize(Rol.LECTURA), validate(descargarAdjuntoReq), descargarAdjuntoController);
