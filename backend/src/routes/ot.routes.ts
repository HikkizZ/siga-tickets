import { Router } from "express";
import { Rol } from "../entities/enums.js";
import { authenticate } from "../middlewares/authenticate.js";
import { authorize } from "../middlewares/authorize.js";
import { validate } from "../middlewares/validate.js";
import {
  actualizarEtapaReq,
  actualizarOtReq,
  agregarColaboradorReq,
  cambiarEstadoReq,
  crearComentarioReq,
  crearEtapaReq,
  crearHoraReq,
  crearOtReq,
  derivarReq,
  eliminarEtapaReq,
  eliminarHoraReq,
  kanbanReq,
  listarOtsReq,
  otIdReq,
  quitarColaboradorReq,
} from "../validations/ot.validation.js";
import { vincularCotizacionReq } from "../validations/cotizacion.validation.js";
import * as c from "../controllers/ot.controller.js";

export const otRouter = Router();

otRouter.use(authenticate);

// Rol grueso aquí; el permiso por fila (responsable/colaborador) lo aplica el servicio con ot.policy.
otRouter.get("/", authorize(Rol.LECTURA), validate(listarOtsReq), c.listarOtsController);
// /kanban antes de /:id, o Express lo tomaría como un id.
otRouter.get("/kanban", authorize(Rol.LECTURA), validate(kanbanReq), c.kanbanController);
otRouter.post("/", authorize(Rol.TECNICO), validate(crearOtReq), c.crearOtController);
otRouter.get("/:id", authorize(Rol.LECTURA), validate(otIdReq), c.detalleOtController);
otRouter.patch("/:id", authorize(Rol.TECNICO), validate(actualizarOtReq), c.actualizarOtController);
otRouter.post("/:id/estado", authorize(Rol.TECNICO), validate(cambiarEstadoReq), c.cambiarEstadoController);
otRouter.post("/:id/derivar", authorize(Rol.TECNICO), validate(derivarReq), c.derivarController);

otRouter.post("/:id/colaboradores", authorize(Rol.TECNICO), validate(agregarColaboradorReq), c.agregarColaboradorController);
otRouter.delete("/:id/colaboradores/:usuarioId", authorize(Rol.TECNICO), validate(quitarColaboradorReq), c.quitarColaboradorController);

otRouter.get("/:id/comentarios", authorize(Rol.LECTURA), validate(otIdReq), c.listarComentariosController);
otRouter.post("/:id/comentarios", authorize(Rol.TECNICO), validate(crearComentarioReq), c.crearComentarioController);

otRouter.get("/:id/horas", authorize(Rol.LECTURA), validate(otIdReq), c.listarHorasController);
otRouter.post("/:id/horas", authorize(Rol.TECNICO), validate(crearHoraReq), c.registrarHorasController);
otRouter.delete("/:id/horas/:horaId", authorize(Rol.TECNICO), validate(eliminarHoraReq), c.eliminarHorasController);

otRouter.get("/:id/etapas", authorize(Rol.LECTURA), validate(otIdReq), c.listarEtapasController);
otRouter.post("/:id/etapas", authorize(Rol.TECNICO), validate(crearEtapaReq), c.crearEtapaController);
otRouter.patch("/:id/etapas/:etapaId", authorize(Rol.TECNICO), validate(actualizarEtapaReq), c.actualizarEtapaController);
otRouter.delete("/:id/etapas/:etapaId", authorize(Rol.TECNICO), validate(eliminarEtapaReq), c.eliminarEtapaController);

// Fase 2 (cotizaciones): sin permiso por fila, solo gestion/admin (ver cotizacion.policy.ts).
otRouter.post("/:id/cotizaciones/vincular", authorize(Rol.GESTION), validate(vincularCotizacionReq), c.vincularCotizacionController);
