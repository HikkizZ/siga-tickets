import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import * as api from "@/lib/api/clientes";
import type { ActualizarClienteInput, CrearClienteInput } from "@/lib/api/clientes";
import { useAuth } from "@/lib/auth/AuthProvider";

const clientesKeys = { all: ["clientes"] as const };

function mensajeError(error: unknown): string {
  return error instanceof ApiError ? error.message : "Ocurrió un error inesperado. Intenta de nuevo.";
}

/** Lista de clientes reales del backend (GET /clientes, rol mínimo lectura). */
export function useClientes() {
  const { estaAutenticado } = useAuth();
  return useQuery({
    queryKey: clientesKeys.all,
    queryFn: api.obtenerClientes,
    enabled: estaAutenticado,
  });
}

// Escritura (Fase E2, directorio de clientes): admin-only (ver puedeEscribirClientes en
// src/lib/labels.ts), mismo criterio de mutación que useDepartamentos.ts.
export function useCrearCliente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (datos: CrearClienteInput) => api.crearCliente(datos),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clientesKeys.all }),
    onError: (error) => toast.error(mensajeError(error)),
  });
}

export function useActualizarCliente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: ActualizarClienteInput }) =>
      api.actualizarCliente(id, datos),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clientesKeys.all }),
    onError: (error) => toast.error(mensajeError(error)),
  });
}
