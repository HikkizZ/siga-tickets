// Funciones de red puras para Temas de ayuda (docs/api.md, sección "Temas de ayuda (Fase B1)"):
// catálogo inspirado en osTicket ("Help Topics"), aditivo y sin ningún efecto automático sobre
// prioridad/departamento del ticket. Mismo patrón que departamentos.ts / sla.ts — sin React ni
// TanStack Query acá, eso vive en src/hooks/useTemasAyuda.ts.
import { apiClient } from "./client";
import type { PrioridadRef } from "./ots";

export type DepartamentoRefTema = { id: string; nombre: string } | null;

export type TemaAyuda = {
  id: string;
  nombre: string;
  activo: boolean;
  esPublico: boolean;
  departamento: DepartamentoRefTema;
  // Fase C: prioridadSugerida pasa de string plano a `{id, nombre}`, mismo criterio que
  // departamento (docs/api.md).
  prioridadSugerida: PrioridadRef | null;
  orden: number;
};

// Lista completa, ya ordenada por el backend (orden, luego nombre) — sin paginación.
export async function obtenerTemasAyuda(): Promise<TemaAyuda[]> {
  const { data } = await apiClient.get<TemaAyuda[]>("/temas-ayuda");
  return data;
}

export type CrearTemaAyudaInput = {
  nombre: string;
  activo?: boolean;
  esPublico?: boolean;
  departamentoId?: string;
  prioridadSugeridaId?: string;
  orden?: number;
};

export async function crearTemaAyuda(datos: CrearTemaAyudaInput): Promise<TemaAyuda> {
  const { data } = await apiClient.post<TemaAyuda>("/temas-ayuda", datos);
  return data;
}

// `departamentoId`/`prioridadSugeridaId` aceptan `null` para desasignar (docs/api.md).
export type ActualizarTemaAyudaInput = Partial<{
  nombre: string;
  activo: boolean;
  esPublico: boolean;
  departamentoId: string | null;
  prioridadSugeridaId: string | null;
  orden: number;
}>;

export async function actualizarTemaAyuda(
  id: string,
  datos: ActualizarTemaAyudaInput,
): Promise<TemaAyuda> {
  const { data } = await apiClient.patch<TemaAyuda>(`/temas-ayuda/${id}`, datos);
  return data;
}
