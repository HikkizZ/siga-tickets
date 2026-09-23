// Funciones de red puras para Departamentos (docs/api.md, sección "Departamentos (Fase B1)"):
// catálogo simple, mismo patrón que clientes.ts pero con PATCH (sin DELETE — se desactiva con
// `activo`, mismo criterio que `cliente.activo`). Sin React ni TanStack Query acá, eso vive en
// src/hooks/useDepartamentos.ts.
import { apiClient } from "./client";

export type Departamento = { id: string; nombre: string; activo: boolean };

export async function obtenerDepartamentos(): Promise<Departamento[]> {
  const { data } = await apiClient.get<Departamento[]>("/departamentos");
  return data;
}

export type CrearDepartamentoInput = { nombre: string };

export async function crearDepartamento(datos: CrearDepartamentoInput): Promise<Departamento> {
  const { data } = await apiClient.post<Departamento>("/departamentos", datos);
  return data;
}

export type ActualizarDepartamentoInput = Partial<{ nombre: string; activo: boolean }>;

export async function actualizarDepartamento(
  id: string,
  datos: ActualizarDepartamentoInput,
): Promise<Departamento> {
  const { data } = await apiClient.patch<Departamento>(`/departamentos/${id}`, datos);
  return data;
}
