// Funciones de red puras para cuentas de cliente del portal (docs/api.md, sección "Cuentas de
// cliente (Fase D)"), mismo patrón que src/lib/api/portal.ts: todas pasan por `publicApiClient`
// (nunca `apiClient`), esta vez con `cuentaToken` (JWT scope:"portal-cuenta", 7 días) en vez de
// `portalToken` (JWT scope:"portal", 15 min, por ticket) en las rutas que lo exigen. Aditivo al
// flujo de portal.ts — no lo reemplaza ni lo modifica.
import { publicApiClient } from "./client";
import type { TicketPublico } from "./portal";

// Mismo NoopCaptcha del backend que ya usa portal.ts (docs/api.md, sección "Captcha"): acepta
// cualquier `captchaToken` no vacío. Constante propia, no importada de portal.ts (no está
// exportada ahí) — mismo valor placeholder, mismo criterio.
const CAPTCHA_TOKEN_PLACEHOLDER = "portal-sin-captcha-real";

// ---- POST /publico/cuentas/registro ----

export type RegistrarCuentaInput = { nombre: string; email: string; password: string };

export async function registrarCuenta(input: RegistrarCuentaInput): Promise<{ token: string }> {
  const { data } = await publicApiClient.post<{ token: string }>("/cuentas/registro", {
    nombre: input.nombre,
    email: input.email,
    password: input.password,
    captchaToken: CAPTCHA_TOKEN_PLACEHOLDER,
  });
  return data;
}

// ---- POST /publico/cuentas/login ----

export type LoginCuentaInput = { email: string; password: string };

export async function loginCuenta(input: LoginCuentaInput): Promise<{ token: string }> {
  const { data } = await publicApiClient.post<{ token: string }>("/cuentas/login", {
    email: input.email,
    password: input.password,
    captchaToken: CAPTCHA_TOKEN_PLACEHOLDER,
  });
  return data;
}

// ---- GET /publico/cuentas/mis-tickets ----

export type TicketCuentaResumen = {
  numero: string;
  asunto: string;
  estado: TicketPublico["estado"];
  fechaIngreso: string;
};

export async function obtenerMisTickets(
  cuentaToken: string,
  page: number,
  perPage: number,
): Promise<{ items: TicketCuentaResumen[]; total: number; page: number; perPage: number }> {
  const { data, meta } = await publicApiClient.get<TicketCuentaResumen[]>(
    `/cuentas/mis-tickets?page=${page}&perPage=${perPage}`,
    { cuentaToken },
  );
  return {
    items: data,
    total: (meta?.["total"] as number | undefined) ?? data.length,
    page: (meta?.["page"] as number | undefined) ?? page,
    perPage: (meta?.["perPage"] as number | undefined) ?? perPage,
  };
}

// ---- GET /publico/cuentas/tickets/:numero ----

// Misma proyección que GET /publico/ticket (docs/api.md): se reutiliza el tipo TicketPublico de
// portal.ts tal cual, sin duplicarlo.
export async function obtenerDetalleTicketCuenta(cuentaToken: string, numero: string): Promise<TicketPublico> {
  const { data } = await publicApiClient.get<TicketPublico>(`/cuentas/tickets/${encodeURIComponent(numero)}`, {
    cuentaToken,
  });
  return data;
}

// ---- POST /publico/cuentas/tickets/:numero/mensajes ----

export async function responderTicketCuenta(
  cuentaToken: string,
  numero: string,
  cuerpo: string,
  archivos?: File[],
): Promise<{ id: string; cuerpo: string; creadoEn: string }> {
  const formData = new FormData();
  formData.set("cuerpo", cuerpo);
  for (const archivo of archivos ?? []) {
    formData.append("adjuntos", archivo);
  }
  const { data } = await publicApiClient.postForm<{ id: string; cuerpo: string; creadoEn: string }>(
    `/cuentas/tickets/${encodeURIComponent(numero)}/mensajes`,
    formData,
    { cuentaToken },
  );
  return data;
}
