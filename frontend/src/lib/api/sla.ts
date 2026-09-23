// Funciones de red puras para SLA (docs/api.md, sección "SLA y notificaciones (Fase 4)"):
// configuración por prioridad y feriados. Mismo patrón que src/lib/api/ots.ts /
// src/lib/api/cotizaciones.ts — sin React ni TanStack Query acá, eso vive en src/hooks/useSla.ts.
import { apiClient } from "./client";
import type { Prioridad } from "@/lib/labels";

// ---- Configuración por prioridad (GET/PUT /sla/config) ----

export type SlaConfigFila = {
  prioridad: Prioridad;
  horasResolucion: number;
  horasPrimeraRespuesta: number;
  usarHorasHabiles: boolean;
  pausarEnEsperaCliente: boolean;
  umbralPorVencer: number;
};

export async function obtenerSlaConfig(): Promise<SlaConfigFila[]> {
  const { data } = await apiClient.get<SlaConfigFila[]>("/sla/config");
  return data;
}

// PUT /sla/config: 1 a 3 filas, sin repetir prioridad; todos los campos opcionales salvo
// `prioridad` (solo se actualiza lo enviado en cada fila).
export type ActualizarSlaConfigFila = { prioridad: Prioridad } & Partial<
  Omit<SlaConfigFila, "prioridad">
>;

export async function actualizarSlaConfig(configs: ActualizarSlaConfigFila[]): Promise<SlaConfigFila[]> {
  const { data } = await apiClient.put<SlaConfigFila[]>("/sla/config", { configs });
  return data;
}

// ---- Feriados (GET/POST/DELETE /sla/feriados) ----

export type Feriado = { fecha: string; nombre: string; irrenunciable: boolean };

export async function obtenerFeriados(): Promise<Feriado[]> {
  const { data } = await apiClient.get<Feriado[]>("/sla/feriados");
  return data;
}

export type CrearFeriadoInput = { fecha: string; nombre: string; irrenunciable?: boolean };

export async function crearFeriado(datos: CrearFeriadoInput): Promise<Feriado> {
  const { data } = await apiClient.post<Feriado>("/sla/feriados", datos);
  return data;
}

export async function eliminarFeriado(fecha: string): Promise<void> {
  await apiClient.delete(`/sla/feriados/${fecha}`);
}
