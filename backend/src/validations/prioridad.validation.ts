import { z } from "zod";

const uuid = (msg = "Id inválido") => z.string().uuid(msg);
const nombre = z.string().trim().min(1, "El nombre es obligatorio").max(60);

export const crearPrioridadReq = {
  body: z
    .object({
      nombre,
      orden: z.number().int().optional(),
      activo: z.boolean().optional(),
      planSlaId: uuid("planSlaId inválido").nullable().optional(),
    })
    .strict(),
};

export const actualizarPrioridadReq = {
  params: z.object({ id: uuid() }),
  body: z
    .object({
      nombre: nombre.optional(),
      orden: z.number().int().optional(),
      activo: z.boolean().optional(),
      planSlaId: uuid("planSlaId inválido").nullable().optional(),
    })
    .strict()
    .refine((b) => Object.keys(b).length > 0, { message: "No hay campos para actualizar" }),
};
