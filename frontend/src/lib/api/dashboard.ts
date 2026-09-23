// Funciones de red puras para el dashboard (docs/api.md, sección "Dashboard y búsqueda global
// (Fase 7)"): un único GET, sin paginación ni caché propia (el backend arma todo por consulta
// directa). Mismo patrón que src/lib/api/sla.ts — sin React ni TanStack Query acá, eso vive en
// src/hooks/useDashboard.ts.
import { apiClient } from "./client";
import type { EstadoCotizacion, EstadoOt } from "@/lib/labels";

export type DashboardFiltros = { desde?: string | undefined; hasta?: string | undefined };

export type DashboardOtPorEstado = { estado: EstadoOt; cantidad: number };
export type DashboardOtPorCliente = { clienteId: string; clienteNombre: string; cantidad: number };
export type DashboardOtPorResponsable = { usuarioId: string; usuarioNombre: string; cantidad: number };
export type DashboardCotizacionPorEstado = { estado: EstadoCotizacion; cantidad: number; montoClp: number };

// Cada campo indica en docs/api.md si es "foto actual" (no se mueve con desde/hasta) o
// "filtrado" (sí respeta el rango, sobre la columna que documenta la tabla) — ver el detalle en
// src/routes/dashboard.tsx, que es el único lugar que debe decidir cómo mostrarlo.
export type Dashboard = {
  // ---- Foto actual ----
  otActivas: number;
  otConSlaVencido: number;
  otPorEstado: DashboardOtPorEstado[];
  otPorCliente: DashboardOtPorCliente[];
  otPorResponsable: DashboardOtPorResponsable[];
  ticketsSinResponderFueraDeSla: number;
  // ---- Filtrado por desde/hasta ----
  montoCotizacionesAprobadas: number;
  tiempoMedioResolucionDias: number | null;
  cotizacionesPorEstado: DashboardCotizacionPorEstado[];
  tiempoMedioPrimeraRespuestaHoras: number | null;
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

export async function obtenerDashboard(filtros?: DashboardFiltros): Promise<Dashboard> {
  const { data } = await apiClient.get<Dashboard>(`/dashboard${aQueryString(filtros)}`);
  return data;
}
