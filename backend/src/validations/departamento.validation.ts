import { z } from "zod";

const nombre = z.string().trim().min(1, "El nombre es obligatorio").max(120);

export const crearDepartamentoReq = {
  body: z.object({ nombre }).strict(),
};

export const actualizarDepartamentoReq = {
  params: z.object({ id: z.string().uuid("Id inválido") }),
  body: z
    .object({ nombre: nombre.optional(), activo: z.boolean().optional() })
    .strict()
    .refine((b) => Object.keys(b).length > 0, { message: "No hay campos para actualizar" }),
};
