import { z } from "zod";
import { EntidadAdjunto } from "../entities/enums.js";

// Los campos de texto del multipart llegan como strings en req.body (después de multer).
// Fase 3: entidadTipo se generaliza de z.literal("ot") a un enum de las tres entidades que
// admiten adjunto (ver adjunto.service.ts). "mensaje" existe para adjuntar directo a un mensaje
// ya creado; el flujo normal del panel sube ANTES con entidadTipo=ticket y los asocia con
// adjuntoIds en POST /tickets/:id/mensajes (ver ticket.mensaje.service.ts).
export const subirAdjuntoReq = {
  body: z.object({
    entidadTipo: z.nativeEnum(EntidadAdjunto, { errorMap: () => ({ message: "entidadTipo debe ser ot, ticket o mensaje" }) }),
    entidadId: z.string().uuid("entidadId inválido"),
  }),
};

export const descargarAdjuntoReq = { params: z.object({ id: z.string().uuid("Id inválido") }) };
