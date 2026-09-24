// Funciones de red puras para SLA (docs/api.md, sección "SLA y notificaciones (Fase 4)"):
// feriados. Mismo patrón que src/lib/api/ots.ts / src/lib/api/cotizaciones.ts — sin React ni
// TanStack Query acá, eso vive en src/hooks/useSla.ts.
//
// Fase C: GET/PUT /sla/config (configuración de SLA por prioridad, 3 filas fijas) se retiró por
// completo — `Prioridad.planSlaId` (src/lib/api/prioridades.ts) conecta cada prioridad a un Plan
// SLA (src/lib/api/planesSla.ts), que pasa a ser el único sistema real de cálculo de SLA.
import { apiClient } from "./client";

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
