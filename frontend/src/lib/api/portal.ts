// Funciones de red puras para el portal público de la mesa de ayuda (docs/api.md, sección
// "Pública (Fase 5)"), mismo patrón que src/lib/api/tickets.ts / ots.ts. A diferencia de esos
// dos, ninguna función de acá usa `apiClient` (JWT interno) — todas pasan por `publicApiClient`
// (`/publico`, sin Authorization salvo `portalToken`).
import { publicApiClient } from "./client";
import type { EstadoOt, EstadoTicket, Prioridad } from "@/lib/labels";

// El backend usa NoopCaptcha (docs/api.md, sección "Captcha"): aprueba cualquier `captchaToken`
// no vacío. Todavía no hay un proveedor real (Turnstile/hCaptcha) del lado del backend, así que
// este es un valor fijo placeholder hasta que exista — no se monta ningún widget de captcha real.
const CAPTCHA_TOKEN_PLACEHOLDER = "portal-sin-captcha-real";

// ---- POST /publico/tickets ----

export type CrearTicketPublicoInput = {
  nombre: string;
  correo: string;
  empresa?: string;
  asunto: string;
  descripcion: string;
  prioridad?: Prioridad;
  archivos?: File[];
};

export async function crearTicketPublico(input: CrearTicketPublicoInput): Promise<{ numero: string }> {
  const formData = new FormData();
  formData.set("nombre", input.nombre);
  formData.set("correo", input.correo);
  if (input.empresa) formData.set("empresa", input.empresa);
  formData.set("asunto", input.asunto);
  formData.set("descripcion", input.descripcion);
  if (input.prioridad) formData.set("prioridad", input.prioridad);
  formData.set("captchaToken", CAPTCHA_TOKEN_PLACEHOLDER);
  for (const archivo of input.archivos ?? []) {
    formData.append("adjuntos", archivo);
  }
  const { data } = await publicApiClient.postForm<{ numero: string }>("/tickets", formData);
  return data;
}

// ---- POST /publico/tickets/seguimiento ----

export type SolicitarSeguimientoInput = { numero: string; email: string };

/** Devuelve el token de portal (scope "portal", 15 min). El backend da la misma respuesta
 * genérica (401 SEGUIMIENTO_INVALIDO) si el número no existe o si el correo no coincide — nunca
 * revela cuál de las dos causas fue, y este módulo no intenta distinguirlas tampoco. */
export async function solicitarSeguimiento(input: SolicitarSeguimientoInput): Promise<{ token: string }> {
  const { data } = await publicApiClient.post<{ token: string }>("/tickets/seguimiento", {
    numero: input.numero,
    email: input.email,
    captchaToken: CAPTCHA_TOKEN_PLACEHOLDER,
  });
  return data;
}

// ---- GET /publico/ticket ----

export type MensajePublico = {
  id: string;
  tipo: "cliente" | "respuesta_cliente";
  cuerpo: string;
  creadoEn: string;
};

export type OtPublica = {
  estado: EstadoOt;
  fechaEstimadaTermino: string | null;
  responsableNombre: string;
} | null;

export type TicketPublico = {
  numero: string;
  asunto: string;
  descripcion: string;
  estado: EstadoTicket;
  fechaIngreso: string;
  mensajes: MensajePublico[];
  ot: OtPublica;
};

export async function obtenerTicketPublico(portalToken: string): Promise<TicketPublico> {
  const { data } = await publicApiClient.get<TicketPublico>("/ticket", { portalToken });
  return data;
}

// ---- POST /publico/ticket/mensajes ----

export async function responderComoClientePublico(
  portalToken: string,
  cuerpo: string,
  archivos?: File[],
): Promise<{ id: string; cuerpo: string; creadoEn: string }> {
  const formData = new FormData();
  formData.set("cuerpo", cuerpo);
  for (const archivo of archivos ?? []) {
    formData.append("adjuntos", archivo);
  }
  const { data } = await publicApiClient.postForm<{ id: string; cuerpo: string; creadoEn: string }>(
    "/ticket/mensajes",
    formData,
    { portalToken },
  );
  return data;
}

// ---- POST /publico/adjuntos ----

/** Adjunta un archivo suelto al ticket del token, fuera del flujo de un mensaje puntual. El DTO
 * de `GET /publico/ticket` (arriba) no expone ningún id de adjunto (ni por mensaje ni a nivel de
 * ticket), así que no hay forma de listarlo ni descargarlo después desde el portal — ver
 * docs/frontend-diseno.md, decisión de la Fase 5. */
export async function adjuntarArchivoPublico(portalToken: string, archivo: File): Promise<{ id: string }> {
  const formData = new FormData();
  formData.set("archivo", archivo);
  const { data } = await publicApiClient.postForm<{ id: string }>("/adjuntos", formData, { portalToken });
  return data;
}
