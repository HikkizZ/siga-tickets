// Funciones de red puras para CanalTicket, expuesto al admin como "fuentes" (docs/api.md, sección
// "Catálogos administrables (Fase C)"): la URL dice "fuentes" pero el campo interno del Ticket
// sigue llamándose `canal` — mismo criterio en este archivo, para no desalinearse del resto de la
// base de código (`Ticket.canalId`, `TicketResumen.canal`, etc.). Mismo patrón CRUD que
// departamentos.ts (sin DELETE, se desactiva con `activo`). Sin React ni TanStack Query acá, eso
// vive en src/hooks/useFuentesTicket.ts.
import { apiClient } from "./client";
import type { OrigenOt } from "@/lib/labels";

export type FuenteTicket = {
  id: string;
  nombre: string;
  orden: number;
  activo: boolean;
  esManual: boolean;
  origenOtEquivalente: OrigenOt;
};

export async function obtenerFuentesTicket(): Promise<FuenteTicket[]> {
  const { data } = await apiClient.get<FuenteTicket[]>("/fuentes-ticket");
  return data;
}

export type CrearFuenteTicketInput = {
  nombre: string;
  orden?: number;
  activo?: boolean;
  esManual?: boolean;
  origenOtEquivalente: OrigenOt;
};

export async function crearFuenteTicket(datos: CrearFuenteTicketInput): Promise<FuenteTicket> {
  const { data } = await apiClient.post<FuenteTicket>("/fuentes-ticket", datos);
  return data;
}

export type ActualizarFuenteTicketInput = Partial<Omit<FuenteTicket, "id">>;

export async function actualizarFuenteTicket(id: string, datos: ActualizarFuenteTicketInput): Promise<FuenteTicket> {
  const { data } = await apiClient.patch<FuenteTicket>(`/fuentes-ticket/${id}`, datos);
  return data;
}
