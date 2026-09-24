// Funciones de red puras para Prioridad (docs/api.md, sección "Catálogos administrables (Fase
// C)"): catálogo compartido por Ticket y OT (misma tabla `prioridad` referenciada por ambos).
// Mismo patrón que departamentos.ts (sin DELETE — se desactiva con `activo`), salvo que acá el
// PATCH además puede cambiar `planSlaId` (conecta esta prioridad a un Plan SLA existente, o `null`
// para "sin SLA"). Sin React ni TanStack Query acá, eso vive en src/hooks/usePrioridades.ts.
import { apiClient } from "./client";

export type Prioridad = { id: string; nombre: string; orden: number; activo: boolean; planSlaId: string | null };

export async function obtenerPrioridades(): Promise<Prioridad[]> {
  const { data } = await apiClient.get<Prioridad[]>("/prioridades");
  return data;
}

export type CrearPrioridadInput = { nombre: string; orden?: number; activo?: boolean; planSlaId?: string | null };

export async function crearPrioridad(datos: CrearPrioridadInput): Promise<Prioridad> {
  const { data } = await apiClient.post<Prioridad>("/prioridades", datos);
  return data;
}

export type ActualizarPrioridadInput = Partial<{
  nombre: string;
  orden: number;
  activo: boolean;
  planSlaId: string | null;
}>;

export async function actualizarPrioridad(id: string, datos: ActualizarPrioridadInput): Promise<Prioridad> {
  const { data } = await apiClient.patch<Prioridad>(`/prioridades/${id}`, datos);
  return data;
}
