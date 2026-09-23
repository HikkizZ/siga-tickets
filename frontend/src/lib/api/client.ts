// Cliente de red único: envuelve fetch, entiende el sobre {status,data,meta} del backend
// (docs/api.md) y nunca se debe evitar con un fetch suelto en un componente.
import { getToken, setToken } from "@/lib/auth/token";

/** Error tipado que lanza el cliente ante cualquier respuesta {status:'error',...} del backend. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

type SobreOk<T> = { status: "ok"; data: T; meta?: Record<string, unknown> };
type SobreError = { status: "error"; code: string; message: string; details?: unknown };
type Sobre<T> = SobreOk<T> | SobreError;

type Metodo = "GET" | "POST" | "PATCH" | "DELETE" | "PUT";

type Respuesta<T> = { data: T; meta?: Record<string, unknown> };

type OpcionesPeticion = {
  method?: Metodo;
  body?: unknown;
  /** Adjunta `Authorization: Bearer <token>`. Por defecto true para el cliente interno. */
  auth?: boolean;
  signal?: AbortSignal;
};

// Vite ya inyecta las variables VITE_*; sin .env.local (p. ej. build de otro entorno) se cae a
// localhost:3002, el puerto real del backend en desarrollo (ver docs/frontend-diseno.md).
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3002/api/v1";
// El portal público vive en /publico, sin el prefijo /api/v1 (ver docs/api.md).
const PORTAL_URL = `${API_URL.replace(/\/api\/v1\/?$/, "")}/publico`;

async function leerSobre<T>(res: Response): Promise<Sobre<T> | null> {
  try {
    return (await res.json()) as Sobre<T>;
  } catch {
    // Cuerpo vacío (p. ej. 204) o no-JSON: no es necesariamente un error.
    return null;
  }
}

/** Interpreta el sobre del backend: devuelve {data,meta} o lanza ApiError. Común a ambos clientes. */
async function interpretarRespuesta<T>(res: Response): Promise<Respuesta<T>> {
  const sobre = await leerSobre<T>(res);

  if (!res.ok || sobre?.status === "error") {
    if (sobre?.status === "error") {
      throw new ApiError(res.status, sobre.code, sobre.message, sobre.details);
    }
    throw new ApiError(res.status, "UNKNOWN_ERROR", res.statusText || "Error desconocido");
  }

  if (sobre?.status === "ok") {
    return sobre.meta !== undefined ? { data: sobre.data, meta: sobre.meta } : { data: sobre.data };
  }

  // 2xx sin cuerpo (poco común en esta API, pero no debe reventar el llamador).
  return { data: undefined as T };
}

async function ejecutar<T>(baseUrl: string, ruta: string, opciones: OpcionesPeticion): Promise<Respuesta<T>> {
  const { method = "GET", body, auth = true, signal } = opciones;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${baseUrl}${ruta}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...(signal ? { signal } : {}),
  });

  // Sesión deslizante: si el backend renovó el token (le quedaba poco TTL), se guarda solo,
  // sin que el usuario note nada (ver backend/src/middlewares/authenticate.ts).
  const renovado = res.headers.get("X-Renewed-Token");
  if (renovado) setToken(renovado);

  return interpretarRespuesta<T>(res);
}

type OpcionesLlamada = Omit<OpcionesPeticion, "method" | "body">;

// POST multipart/form-data (adjuntos, docs/api.md sección "Adjuntos"): el body no es JSON, así
// que no puede pasar por `ejecutar` (que siempre fija Content-Type: application/json).
async function ejecutarForm<T>(
  baseUrl: string,
  ruta: string,
  formData: FormData,
  opciones: Pick<OpcionesPeticion, "signal"> = {},
): Promise<Respuesta<T>> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${ruta}`, {
    method: "POST",
    headers,
    body: formData,
    ...(opciones.signal ? { signal: opciones.signal } : {}),
  });

  const renovado = res.headers.get("X-Renewed-Token");
  if (renovado) setToken(renovado);

  return interpretarRespuesta<T>(res);
}

/** Cliente autenticado contra /api/v1. Adjunta el JWT salvo que se pase `auth: false`. */
export const apiClient = {
  get: <T>(ruta: string, opciones?: OpcionesLlamada) => ejecutar<T>(API_URL, ruta, { ...opciones, method: "GET" }),
  post: <T>(ruta: string, body?: unknown, opciones?: OpcionesLlamada) =>
    ejecutar<T>(API_URL, ruta, { ...opciones, method: "POST", body }),
  patch: <T>(ruta: string, body?: unknown, opciones?: OpcionesLlamada) =>
    ejecutar<T>(API_URL, ruta, { ...opciones, method: "PATCH", body }),
  put: <T>(ruta: string, body?: unknown, opciones?: OpcionesLlamada) =>
    ejecutar<T>(API_URL, ruta, { ...opciones, method: "PUT", body }),
  delete: <T>(ruta: string, opciones?: OpcionesLlamada) =>
    ejecutar<T>(API_URL, ruta, { ...opciones, method: "DELETE" }),
  postForm: <T>(ruta: string, formData: FormData, opciones?: Pick<OpcionesPeticion, "signal">) =>
    ejecutarForm<T>(API_URL, ruta, formData, opciones),
};

type OpcionesLlamadaPublica = Omit<OpcionesLlamada, "auth"> & { portalToken?: string };

// Cliente para /publico/*: sin Authorization por defecto. Las fases futuras (portal de
// seguimiento) le pasan `portalToken` con el JWT de scope "portal" de 15 min. No se usa
// en ninguna pantalla todavía — esta fase solo deja la forma lista.
async function ejecutarPublico<T>(
  ruta: string,
  method: Metodo,
  body: unknown,
  opciones: OpcionesLlamadaPublica = {},
): Promise<Respuesta<T>> {
  const { portalToken, signal } = opciones;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (portalToken) headers["Authorization"] = `Bearer ${portalToken}`;

  const res = await fetch(`${PORTAL_URL}${ruta}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...(signal ? { signal } : {}),
  });

  return interpretarRespuesta<T>(res);
}

export const publicApiClient = {
  get: <T>(ruta: string, opciones?: OpcionesLlamadaPublica) => ejecutarPublico<T>(ruta, "GET", undefined, opciones),
  post: <T>(ruta: string, body?: unknown, opciones?: OpcionesLlamadaPublica) =>
    ejecutarPublico<T>(ruta, "POST", body, opciones),
};
