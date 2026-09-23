import { z } from "zod";
import { passwordNueva } from "./auth.validation.js";
import { crearMensajePublicoReq } from "./portal.validation.js";

const captchaToken = z.string().min(1, "captchaToken es obligatorio");
const numero = z.string().trim().min(1, "numero es obligatorio").max(12);

export const registroCuentaPortalReq = {
  body: z
    .object({
      email: z.string().trim().email("email inválido").max(320),
      // Mismo rango que POST /auth/password (auth.validation.ts::passwordNueva): 8-72 caracteres.
      password: passwordNueva,
      nombre: z.string().trim().min(1, "nombre es obligatorio").max(120),
      captchaToken,
    })
    .strict(),
};

export const loginCuentaPortalReq = {
  body: z
    .object({
      email: z.string().trim().email("email inválido").max(320),
      password: z.string().min(1, "Ingresa tu contraseña"),
      captchaToken,
    })
    .strict(),
};

export const misTicketsCuentaPortalReq = {
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(25),
  }),
};

export const numeroTicketCuentaPortalReq = {
  params: z.object({ numero }),
};

// Mismo cuerpo que POST /publico/ticket/mensajes (crearMensajePublicoReq): reutilizado, no
// redefinido, para que ambos caminos exijan exactamente la misma regla sobre `cuerpo`.
export const mensajeCuentaPortalReq = {
  params: z.object({ numero }),
  body: crearMensajePublicoReq.body,
};
