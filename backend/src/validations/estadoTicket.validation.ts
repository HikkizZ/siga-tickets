import { z } from "zod";

const uuid = (msg = "Id inválido") => z.string().uuid(msg);
const nombre = z.string().trim().min(1, "El nombre es obligatorio").max(60);

const flags = {
  esEstadoInicial: z.boolean().optional(),
  esDestinoReapertura: z.boolean().optional(),
  esPausaSla: z.boolean().optional(),
  marcaResueltoEn: z.boolean().optional(),
  marcaCerradoEn: z.boolean().optional(),
  esTerminal: z.boolean().optional(),
};

export const crearEstadoTicketReq = {
  body: z
    .object({
      nombre,
      orden: z.number().int().optional(),
      activo: z.boolean().optional(),
      ...flags,
    })
    .strict(),
};

export const actualizarEstadoTicketReq = {
  params: z.object({ id: uuid() }),
  body: z
    .object({
      nombre: nombre.optional(),
      orden: z.number().int().optional(),
      activo: z.boolean().optional(),
      ...flags,
    })
    .strict()
    .refine((b) => Object.keys(b).length > 0, { message: "No hay campos para actualizar" }),
};
