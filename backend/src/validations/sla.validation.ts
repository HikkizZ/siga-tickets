import { z } from "zod";
import { fechaIso } from "./ot.validation.js";

const horasEntero = z.number({ invalid_type_error: "debe ser un número" }).int("debe ser un entero").gt(0, "debe ser mayor que 0");
const umbral = z.number().gt(0, "umbralPorVencer debe estar en (0,1]").lte(1, "umbralPorVencer debe estar en (0,1]");

const nombreFeriado = z.string().trim().min(1, "El nombre es obligatorio").max(120);

export const crearFeriadoReq = {
  body: z
    .object({
      fecha: fechaIso,
      nombre: nombreFeriado,
      irrenunciable: z.boolean().default(false),
    })
    .strict(),
};

export const eliminarFeriadoReq = {
  params: z.object({ fecha: fechaIso }),
};

// Fase B2: catálogo de Planes SLA con nombre propio (ver entities/PlanSla.ts). Mismos campos de
// configuración que actualizarSlaConfigReq (horasEntero/umbral ya definidos arriba).
const nombrePlan = z.string().trim().min(1, "El nombre es obligatorio").max(160);

// Los opcionales llevan `.default(...)` (mismo criterio que crearFeriadoReq::irrenunciable) y NO
// solo `.optional()`: repo.create() de TypeORM no rellena en memoria el `default` de la columna
// (ese default solo lo aplica la BD en el INSERT), así que si no se manda un valor explícito acá,
// el DTO devuelto por el POST mostraría 0/false en vez del default real hasta un GET posterior.
export const crearPlanSlaReq = {
  body: z
    .object({
      nombre: nombrePlan,
      horasResolucion: horasEntero,
      horasPrimeraRespuesta: horasEntero,
      usarHorasHabiles: z.boolean().default(true),
      pausarEnEsperaCliente: z.boolean().default(true),
      umbralPorVencer: umbral.default(0.2),
      activo: z.boolean().default(true),
    })
    .strict(),
};

export const actualizarPlanSlaReq = {
  params: z.object({ id: z.string().uuid("Id inválido") }),
  body: z
    .object({
      nombre: nombrePlan.optional(),
      activo: z.boolean().optional(),
      horasResolucion: horasEntero.optional(),
      horasPrimeraRespuesta: horasEntero.optional(),
      usarHorasHabiles: z.boolean().optional(),
      pausarEnEsperaCliente: z.boolean().optional(),
      umbralPorVencer: umbral.optional(),
    })
    .strict()
    .refine((b) => Object.keys(b).length > 0, { message: "No hay campos para actualizar" }),
};

export const eliminarPlanSlaReq = {
  params: z.object({ id: z.string().uuid("Id inválido") }),
};
