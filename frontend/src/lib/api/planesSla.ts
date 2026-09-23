// Funciones de red puras para Planes SLA (docs/api.md, sección "Planes SLA (Fase B2)"): catálogo
// CRUD con nombre propio (tabla `plan_sla`), distinto de `sla_config` (las 3 filas fijas por
// prioridad que ya administra src/lib/api/sla.ts). Alcance deliberadamente acotado: ningún cálculo
// real de SLA de OT/ticket usa esto todavía. Mismo patrón que sla.ts — sin React ni TanStack Query
// acá, eso vive en src/hooks/usePlanesSla.ts.
import { apiClient } from "./client";

export type PlanSla = {
  id: string;
  nombre: string;
  activo: boolean;
  horasResolucion: number;
  horasPrimeraRespuesta: number;
  usarHorasHabiles: boolean;
  pausarEnEsperaCliente: boolean;
  umbralPorVencer: number;
  creadoEn: string;
  actualizadoEn: string;
};

export async function obtenerPlanesSla(): Promise<PlanSla[]> {
  const { data } = await apiClient.get<PlanSla[]>("/sla/planes");
  return data;
}

export type CrearPlanSlaInput = {
  nombre: string;
  horasResolucion: number;
  horasPrimeraRespuesta: number;
  usarHorasHabiles?: boolean;
  pausarEnEsperaCliente?: boolean;
  umbralPorVencer?: number;
  activo?: boolean;
};

export async function crearPlanSla(datos: CrearPlanSlaInput): Promise<PlanSla> {
  const { data } = await apiClient.post<PlanSla>("/sla/planes", datos);
  return data;
}

export type ActualizarPlanSlaInput = Partial<Omit<PlanSla, "id" | "creadoEn" | "actualizadoEn">>;

export async function actualizarPlanSla(id: string, datos: ActualizarPlanSlaInput): Promise<PlanSla> {
  const { data } = await apiClient.patch<PlanSla>(`/sla/planes/${id}`, datos);
  return data;
}

// A diferencia de Departamentos/Temas de ayuda, un Plan SLA sí se borra de verdad (docs/api.md:
// hoy no hay ninguna FK que apunte a plan_sla).
export async function eliminarPlanSla(id: string): Promise<void> {
  await apiClient.delete(`/sla/planes/${id}`);
}
