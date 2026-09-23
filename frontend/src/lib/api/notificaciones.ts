// Funciones de red puras para Notificaciones (docs/api.md, sección "Notificaciones (Fase 4)").
// Mismo patrón que src/lib/api/ots.ts.
import { apiClient } from "./client";

export type Notificacion = {
  id: string;
  tipo: string;
  entidadTipo: string;
  entidadId: string;
  titulo: string;
  cuerpo: string;
  leidaEn: string | null;
  creadoEn: string;
};

export type NotificacionesFiltros = {
  page?: number | undefined;
  perPage?: number | undefined;
  soloNoLeidas?: boolean | undefined;
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

export async function obtenerNotificaciones(
  filtros?: NotificacionesFiltros,
): Promise<{ items: Notificacion[]; total: number; page: number; perPage: number }> {
  const { data, meta } = await apiClient.get<Notificacion[]>(`/notificaciones${aQueryString(filtros)}`);
  return {
    items: data,
    total: (meta?.["total"] as number | undefined) ?? data.length,
    page: (meta?.["page"] as number | undefined) ?? 1,
    perPage: (meta?.["perPage"] as number | undefined) ?? data.length,
  };
}

export type BloqueResumen = { total: number; items: { id: string; numero: string }[] };

export type ResumenNotificaciones = {
  otVencidas: BloqueResumen;
  otPrioridadAltaAbiertas: BloqueResumen;
  otPendientesCotizarOAprobar: BloqueResumen;
  ticketsNuevosSinResponder: BloqueResumen;
};

// Panorama operativo de TODO el equipo, no solo lo propio del usuario (decisión del backend, ver
// docs/api.md).
export async function obtenerResumenNotificaciones(): Promise<ResumenNotificaciones> {
  const { data } = await apiClient.get<ResumenNotificaciones>("/notificaciones/resumen");
  return data;
}

export async function marcarNotificacionLeida(id: string): Promise<void> {
  await apiClient.post(`/notificaciones/${id}/leer`);
}

export async function marcarTodasNotificacionesLeidas(): Promise<void> {
  await apiClient.post("/notificaciones/leer-todas");
}
