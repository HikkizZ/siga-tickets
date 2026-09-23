// Funciones de red puras para el buscador global (docs/api.md, sección "Dashboard y búsqueda
// global (Fase 7)"): un único GET, sin paginación (autocompletar, no un listado). Mismo patrón
// que src/lib/api/dashboard.ts — sin React ni TanStack Query acá, eso vive en
// src/hooks/useBuscar.ts.
import { apiClient } from "./client";
import type { EstadoCotizacion, EstadoOt, EstadoTicket } from "@/lib/labels";

export type ResultadoBusquedaOt = { tipo: "ot"; id: string; numero: string; titulo: string; estado: EstadoOt };
export type ResultadoBusquedaTicket = {
  tipo: "ticket";
  id: string;
  numero: string;
  asunto: string;
  estado: EstadoTicket;
};
export type ResultadoBusquedaCotizacion = {
  tipo: "cotizacion";
  id: string;
  numero: string;
  estado: EstadoCotizacion;
  montoClp: number;
};
export type ResultadoBusquedaCliente = { tipo: "cliente"; id: string; nombre: string };

export type ResultadoBusqueda = {
  ots: ResultadoBusquedaOt[];
  tickets: ResultadoBusquedaTicket[];
  cotizaciones: ResultadoBusquedaCotizacion[];
  clientes: ResultadoBusquedaCliente[];
};

export async function buscar(q: string): Promise<ResultadoBusqueda> {
  const { data } = await apiClient.get<ResultadoBusqueda>(`/buscar?q=${encodeURIComponent(q)}`);
  return data;
}
