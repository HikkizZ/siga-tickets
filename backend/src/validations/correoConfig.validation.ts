import { z } from "zod";

const NOMBRES_PLANTILLA = ["ticket_creado", "aviso_soporte", "respuesta_cliente"] as const;

// Fase B2: PUT /correo/plantillas/:nombre. `nombre` restringido a las 3 plantillas fijas que ya
// conoce mail/outbound/plantillas.ts::NombrePlantilla.
export const actualizarPlantillaCorreoReq = {
  params: z.object({ nombre: z.enum(NOMBRES_PLANTILLA) }),
  body: z
    .object({
      asunto: z.string().trim().min(1, "El asunto es obligatorio").max(500),
      cuerpoHtml: z.string().trim().min(1, "El cuerpo es obligatorio"),
      activa: z.boolean().optional(),
    })
    .strict(),
};

// Puerto de red válido (1-65535), entero.
const puerto = z.number({ invalid_type_error: "debe ser un número" }).int("debe ser un entero").min(1).max(65535);

// Body parcial: todo opcional, solo se actualiza lo que viene (mismo criterio que
// sla.validation.ts::actualizarSlaConfigReq). Las contraseñas SIEMPRE llegan en texto plano desde
// afuera; nunca se acepta un valor ya cifrado por este endpoint.
export const actualizarCorreoConfigReq = {
  body: z
    .object({
      imapHost: z.string().trim().min(1).max(255).nullable().optional(),
      imapPort: puerto.optional(),
      imapUser: z.string().trim().min(1).max(255).nullable().optional(),
      imapPassword: z.string().min(1, "imapPassword no puede ser un string vacío").max(500).optional(),
      imapFolder: z.string().trim().min(1).max(120).nullable().optional(),
      imapTls: z.boolean().optional(),
      imapHabilitado: z.boolean().optional(),
      smtpHost: z.string().trim().min(1).max(255).nullable().optional(),
      smtpPort: puerto.optional(),
      smtpUser: z.string().trim().min(1).max(255).nullable().optional(),
      smtpPassword: z.string().min(1, "smtpPassword no puede ser un string vacío").max(500).optional(),
      smtpTls: z.boolean().optional(),
      smtpHabilitado: z.boolean().optional(),
      correoDesde: z.string().trim().min(1).max(255).nullable().optional(),
      dominio: z.string().trim().min(1).max(120).nullable().optional(),
    })
    .strict(),
};
