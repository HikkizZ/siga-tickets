// GET /clientes (docs/api.md, sección "Clientes"). Solo lectura por ahora: crear/editar clientes
// no es parte de la Fase 0.
import { apiClient } from "./client";

export type Cliente = { id: string; nombre: string; activo: boolean };

export async function obtenerClientes(): Promise<Cliente[]> {
  const { data } = await apiClient.get<Cliente[]>("/clientes");
  return data;
}
