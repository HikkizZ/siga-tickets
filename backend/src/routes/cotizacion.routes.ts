import { Router } from "express";
import { Rol } from "../entities/enums.js";
import { authenticate } from "../middlewares/authenticate.js";
import { authorize } from "../middlewares/authorize.js";
import { validate } from "../middlewares/validate.js";
import {
  actualizarCotizacionReq,
  cambiarEstadoCotizacionReq,
  cotizacionIdReq,
  crearCotizacionReq,
  listarCotizacionesReq,
} from "../validations/cotizacion.validation.js";
import * as c from "../controllers/cotizacion.controller.js";

export const cotizacionRouter = Router();

cotizacionRouter.use(authenticate);

// Lectura: cualquier rol autenticado (lectura+). Escritura: solo gestion/admin, sin excepción
// por fila (a diferencia de OT no hay "responsable" que habilite a un tecnico).
cotizacionRouter.get("/", authorize(Rol.LECTURA), validate(listarCotizacionesReq), c.listarCotizacionesController);
cotizacionRouter.post("/", authorize(Rol.GESTION), validate(crearCotizacionReq), c.crearCotizacionController);
cotizacionRouter.get("/:id", authorize(Rol.LECTURA), validate(cotizacionIdReq), c.detalleCotizacionController);
cotizacionRouter.patch("/:id", authorize(Rol.GESTION), validate(actualizarCotizacionReq), c.actualizarCotizacionController);
cotizacionRouter.post("/:id/estado", authorize(Rol.GESTION), validate(cambiarEstadoCotizacionReq), c.cambiarEstadoCotizacionController);
