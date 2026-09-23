import { Router } from "express";
import { Rol } from "../entities/enums.js";
import { authenticate } from "../middlewares/authenticate.js";
import { authorize } from "../middlewares/authorize.js";
import { validate } from "../middlewares/validate.js";
import { buscarReq } from "../validations/buscar.validation.js";
import { buscarController } from "../controllers/buscar.controller.js";

export const buscarRouter = Router();

buscarRouter.use(authenticate);
buscarRouter.get("/", authorize(Rol.LECTURA), validate(buscarReq), buscarController);
