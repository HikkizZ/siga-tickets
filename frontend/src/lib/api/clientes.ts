// Funciones de red para Clientes (docs/api.md, sección "Clientes"). GET es de la Fase 0
// (rol lectura); POST/PATCH se agregan en la Fase E2 (directorio de clientes), admin-only, mismo
// patrón que departamentos.ts (catálogo simple, sin DELETE — se desactiva con `activo`).
import { apiClient } from "./client";

export type Cliente = { id: string; nombre: string; activo: boolean };

export async function obtenerClientes(): Promise<Cliente[]> {
  const { data } = await apiClient.get<Cliente[]>("/clientes");
  return data;
}

export type CrearClienteInput = { nombre: string };

export async function crearCliente(datos: CrearClienteInput): Promise<Cliente> {
  const { data } = await apiClient.post<Cliente>("/clientes", datos);
  return data;
}

export type ActualizarClienteInput = Partial<{ nombre: string; activo: boolean }>;

export async function actualizarCliente(id: string, datos: ActualizarClienteInput): Promise<Cliente> {
  const { data } = await apiClient.patch<Cliente>(`/clientes/${id}`, datos);
  return data;
}
