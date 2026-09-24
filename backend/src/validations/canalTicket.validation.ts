import { z } from "zod";
import { OrigenOt } from "../entities/enums.js";

const uuid = (msg = "Id inválido") => z.string().uuid(msg);
const nombre = z.string().trim().min(1, "El nombre es obligatorio").max(60);

export const crearCanalTicketReq = {
  body: z
    .object({
      nombre,
      orden: z.number().int().optional(),
      activo: z.boolean().optional(),
      esManual: z.boolean().optional(),
      origenOtEquivalente: z.nativeEnum(OrigenOt),
    })
    .strict(),
};

export const actualizarCanalTicketReq = {
  params: z.object({ id: uuid() }),
  body: z
    .object({
      nombre: nombre.optional(),
      orden: z.number().int().optional(),
      activo: z.boolean().optional(),
      esManual: z.boolean().optional(),
      origenOtEquivalente: z.nativeEnum(OrigenOt).optional(),
    })
    .strict()
    .refine((b) => Object.keys(b).length > 0, { message: "No hay campos para actualizar" }),
};
