import { z } from "zod";
import { Prioridad } from "../entities/enums.js";
import { fechaIso } from "./ot.validation.js";

const horasEntero = z.number({ invalid_type_error: "debe ser un número" }).int("debe ser un entero").gt(0, "debe ser mayor que 0");
const umbral = z.number().gt(0, "umbralPorVencer debe estar en (0,1]").lte(1, "umbralPorVencer debe estar en (0,1]");

export const actualizarSlaConfigReq = {
  body: z
    .object({
      configs: z
        .array(
          z
            .object({
              prioridad: z.nativeEnum(Prioridad),
              horasResolucion: horasEntero.optional(),
              horasPrimeraRespuesta: horasEntero.optional(),
              usarHorasHabiles: z.boolean().optional(),
              pausarEnEsperaCliente: z.boolean().optional(),
              umbralPorVencer: umbral.optional(),
            })
            .strict(),
        )
        .min(1, "configs no puede estar vacío")
        .max(3),
    })
    .strict()
    .refine((b) => new Set(b.configs.map((c) => c.prioridad)).size === b.configs.length, {
      path: ["configs"],
      message: "No repitas la misma prioridad dos veces",
    }),
};

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
