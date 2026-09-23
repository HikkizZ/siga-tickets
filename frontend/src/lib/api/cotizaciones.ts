// Funciones de red puras para Cotizaciones (docs/api.md, sección "Cotizaciones (Fase 2)"),
// mismo patrón que src/lib/api/ots.ts. El endpoint de vincular una cotización EXISTENTE a una OT
// (POST /ots/:id/cotizaciones/vincular) vive en ots.ts, no acá: devuelve <Detalle de la OT> (el
// mismo formato de GET /ots/:id), no una Cotizacion.
import { apiClient } from "./client";
import type { EstadoCotizacion } from "@/lib/labels";

export type ClienteRefCotizacion = { id: string; nombre: string } | null;
export type OtRefCotizacion = { id: string; numero: string; titulo: string } | null;
type ActorRef = { id: string; nombre: string };

// Forma común de list/detalle (docs/api.md: "Cotizacion (forma común de list/detalle...)").
export type Cotizacion = {
  id: string;
  numero: string;
  ot: OtRefCotizacion;
  cliente: ClienteRefCotizacion;
  montoClp: number;
  fecha: string;
  estado: EstadoCotizacion;
  version: number;
  esPrincipal: boolean;
  creadoEn: string;
  actualizadoEn: string;
};

export type EventoCotizacion = {
  id: string;
  tipo: string;
  actor: ActorRef;
  payload: Record<string, unknown>;
  ocurridoEn: string;
};

// GET /cotizaciones/:id además trae aprobadaEn y el timeline propio.
export type CotizacionDetalle = Cotizacion & {
  aprobadaEn: string | null;
  eventos: EventoCotizacion[];
};

export type CotizacionesFiltros = {
  page?: number | undefined;
  perPage?: number | undefined;
  orden?: "numero" | "fecha" | "montoClp" | "estado" | "version" | "creadoEn" | "actualizadoEn" | undefined;
  dir?: "asc" | "desc" | undefined;
  estado?: EstadoCotizacion | undefined;
  clienteId?: string | undefined;
  otId?: string | undefined;
  q?: string | undefined;
  desde?: string | undefined;
  hasta?: string | undefined;
};

function aQueryString(filtros: Record<string, unknown> | undefined): string {
  if (!filtros) return "";
  const params = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor === undefined || valor === null || valor === "") continue;
    params.set(clave, String(valor));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function obtenerCotizaciones(
  filtros?: CotizacionesFiltros,
): Promise<{ items: Cotizacion[]; total: number; page: number; perPage: number }> {
  const { data, meta } = await apiClient.get<Cotizacion[]>(`/cotizaciones${aQueryString(filtros)}`);
  return {
    items: data,
    total: (meta?.["total"] as number | undefined) ?? data.length,
    page: (meta?.["page"] as number | undefined) ?? 1,
    perPage: (meta?.["perPage"] as number | undefined) ?? data.length,
  };
}

export async function obtenerCotizacion(id: string): Promise<CotizacionDetalle> {
  const { data } = await apiClient.get<CotizacionDetalle>(`/cotizaciones/${id}`);
  return data;
}

// ---- Crear (POST /cotizaciones) ----

export type CrearCotizacionInput = {
  otId?: string;
  clienteId?: string;
  montoClp: number;
  fecha?: string;
  esPrincipal?: boolean;
};

export async function crearCotizacion(input: CrearCotizacionInput): Promise<Cotizacion> {
  const { data } = await apiClient.post<Cotizacion>("/cotizaciones", input);
  return data;
}

// ---- Actualizar (PATCH /cotizaciones/:id, solo si estado='borrador') ----

export type ActualizarCotizacionInput = Partial<{
  montoClp: number;
  fecha: string;
  clienteId: string;
}>;

export async function actualizarCotizacion(id: string, datos: ActualizarCotizacionInput): Promise<Cotizacion> {
  const { data } = await apiClient.patch<Cotizacion>(`/cotizaciones/${id}`, datos);
  return data;
}

// ---- Estado (POST /cotizaciones/:id/estado) ----

export async function cambiarEstadoCotizacion(id: string, estado: EstadoCotizacion): Promise<Cotizacion> {
  const { data } = await apiClient.post<Cotizacion>(`/cotizaciones/${id}/estado`, { estado });
  return data;
}
