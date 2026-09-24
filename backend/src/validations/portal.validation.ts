import { z } from "zod";

const uuid = (msg = "Id inválido") => z.string().uuid(msg);
const captchaToken = z.string().min(1, "captchaToken es obligatorio");

// Multipart: los campos de texto llegan como string en req.body tras multer. `.strict()` sigue
// aplicando (multer solo copia los campos declarados en el formulario a req.body).
//
// Fase C: prioridad ya no es un enum fijo con default de Zod (`Prioridad.MEDIA`); ahora es opcional
// y el servicio resuelve la fila "Media" cuando no viene (ver portal.service.ts::resolverPrioridadPortal).
export const crearTicketPublicoReq = {
  body: z
    .object({
      nombre: z.string().trim().min(1, "nombre es obligatorio").max(120),
      correo: z.string().trim().email("correo inválido").max(320),
      empresa: z.string().trim().min(1).max(160).optional(),
      asunto: z.string().trim().min(1, "asunto es obligatorio").max(200),
      descripcion: z.string().trim().min(1, "descripcion es obligatoria").max(20000),
      prioridadId: uuid("prioridadId inválido").optional(),
      captchaToken,
    })
    .strict(),
};

export const seguimientoPublicoReq = {
  body: z
    .object({
      numero: z.string().trim().min(1, "numero es obligatorio").max(12),
      email: z.string().trim().email("email inválido").max(320),
      captchaToken,
    })
    .strict(),
};

export const crearMensajePublicoReq = {
  body: z
    .object({
      cuerpo: z.string().trim().min(1, "El mensaje no puede estar vacío").max(20000),
    })
    .strict(),
};

export const descargarAdjuntoPublicoReq = { params: z.object({ id: uuid() }) };
