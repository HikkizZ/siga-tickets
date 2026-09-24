import { z } from "zod";

const uuid = (msg = "Id inválido") => z.string().uuid(msg);
const nombre = z.string().trim().min(1, "El nombre es obligatorio").max(120);

export const crearTemaAyudaReq = {
  body: z
    .object({
      nombre,
      activo: z.boolean().optional(),
      esPublico: z.boolean().optional(),
      departamentoId: uuid("departamentoId inválido").optional(),
      prioridadSugeridaId: uuid("prioridadSugeridaId inválido").optional(),
      orden: z.number().int().optional(),
    })
    .strict(),
};

export const actualizarTemaAyudaReq = {
  params: z.object({ id: uuid() }),
  body: z
    .object({
      nombre: nombre.optional(),
      activo: z.boolean().optional(),
      esPublico: z.boolean().optional(),
      // A diferencia de crear, acepta null explícito para desasignar el departamento/la
      // prioridad sugerida (mismo criterio que los campos opcionales de PATCH /ots/:id).
      departamentoId: uuid("departamentoId inválido").nullable().optional(),
      prioridadSugeridaId: uuid("prioridadSugeridaId inválido").nullable().optional(),
      orden: z.number().int().optional(),
    })
    .strict()
    .refine((b) => Object.keys(b).length > 0, { message: "No hay campos para actualizar" }),
};
