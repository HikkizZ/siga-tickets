import { z } from "zod";
import { EstadoCotizacion } from "../entities/enums.js";
import { fechaIso } from "./ot.validation.js";

const uuid = (msg = "Id inválido") => z.string().uuid(msg);

const montoClp = z
  .number({ invalid_type_error: "montoClp debe ser un número" })
  .int("montoClp debe ser un entero")
  .min(0, "montoClp no puede ser negativo");

const paramsId = z.object({ id: uuid() });

export const crearCotizacionReq = {
  body: z
    .object({
      otId: uuid("otId inválido").optional(),
      clienteId: uuid("clienteId inválido").optional(),
      montoClp,
      fecha: fechaIso.optional(),
      esPrincipal: z.boolean().default(false),
    })
    .strict()
    // Sin otId no hay de dónde autocompletar el cliente: clienteId pasa a ser obligatorio.
    .superRefine((b, ctx) => {
      if (!b.otId && !b.clienteId) {
        ctx.addIssue({ code: "custom", path: ["clienteId"], message: "clienteId es obligatorio si no se especifica otId" });
      }
    }),
};

export const actualizarCotizacionReq = {
  params: paramsId,
  body: z
    .object({
      montoClp: montoClp.optional(),
      fecha: fechaIso.optional(),
      clienteId: uuid("clienteId inválido").optional(),
    })
    .strict()
    .refine((b) => Object.keys(b).length > 0, { message: "No hay campos para actualizar" }),
};

export const cotizacionIdReq = { params: paramsId };

export const cambiarEstadoCotizacionReq = {
  params: paramsId,
  body: z.object({ estado: z.nativeEnum(EstadoCotizacion) }).strict(),
};

// Cuerpo de POST /ots/:id/cotizaciones/vincular (la ruta vive en ot.routes.ts: :id es la OT).
export const vincularCotizacionReq = {
  params: paramsId,
  body: z.object({ cotizacionId: uuid("cotizacionId inválido") }).strict(),
};

export const COLUMNAS_ORDEN_COTIZACION = ["numero", "fecha", "montoClp", "estado", "version", "creadoEn", "actualizadoEn"] as const;

const filtrosCotizacion = {
  estado: z.nativeEnum(EstadoCotizacion).optional(),
  clienteId: uuid("clienteId inválido").optional(),
  otId: uuid("otId inválido").optional(),
  q: z.string().trim().min(1).max(100).optional(),
  desde: fechaIso.optional(),
  hasta: fechaIso.optional(),
};

const rangoValido = (f: { desde?: string | undefined; hasta?: string | undefined }) => !f.desde || !f.hasta || f.desde <= f.hasta;
const rangoMsg = { path: ["hasta"], message: "hasta no puede ser anterior a desde" };

export const listarCotizacionesReq = {
  query: z
    .object({
      ...filtrosCotizacion,
      page: z.coerce.number().int().min(1).default(1),
      perPage: z.coerce.number().int().min(1).max(100).default(25),
      orden: z.enum(COLUMNAS_ORDEN_COTIZACION).default("fecha"),
      dir: z.enum(["asc", "desc"]).default("desc"),
    })
    .refine(rangoValido, rangoMsg),
};

export type FiltrosCotizacion = z.output<typeof listarCotizacionesReq.query>;
