import request from "supertest";
import { app } from "../api/app.js";
import { signPortalToken } from "../auth/portalToken.js";
import { API } from "./otHelpers.js";

export const PORTAL = "/publico";

export const ticketPublicoBody = (extra: Record<string, unknown> = {}) => ({
  nombre: "Juan Pérez",
  correo: "juan.perez@cliente.cl",
  asunto: "No enciende el equipo",
  descripcion: "El PC de recepción no enciende",
  captchaToken: "token-de-prueba",
  ...extra,
});

// multipart sin adjuntos: campos como .field(), igual que hará el frontend real.
export async function crearTicketPublicoApi(extra: Record<string, unknown> = {}) {
  const body = ticketPublicoBody(extra);
  let req = request(app).post(`${PORTAL}/tickets`);
  for (const [k, v] of Object.entries(body)) req = req.field(k, String(v));
  const res = await req;
  if (res.status !== 201) throw new Error(`crearTicketPublicoApi falló: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data as { numero: string };
}

// Token de portal firmado directamente (evita pasar por /publico/tickets/seguimiento en cada test).
export function tokenPortalTest(ticketId: string): string {
  return `Bearer ${signPortalToken(ticketId)}`;
}

export { API };
