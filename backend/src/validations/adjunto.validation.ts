import { z } from "zod";

// Los campos de texto del multipart llegan como strings en req.body (después de multer).
export const subirAdjuntoReq = {
  body: z.object({
    entidadTipo: z.literal("ot", { errorMap: () => ({ message: "En esta fase solo se aceptan adjuntos de OT (entidadTipo=ot)" }) }),
    entidadId: z.string().uuid("entidadId inválido"),
  }),
};

export const descargarAdjuntoReq = { params: z.object({ id: z.string().uuid("Id inválido") }) };
