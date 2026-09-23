// Hooks de TanStack Query para Departamentos (Fase B1) — mismo criterio que src/hooks/useSla.ts:
// un hook por operación, `toast.error` en la mutación.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import * as api from "@/lib/api/departamentos";
import type { ActualizarDepartamentoInput, CrearDepartamentoInput } from "@/lib/api/departamentos";
import { useAuth } from "@/lib/auth/AuthProvider";

const departamentosKeys = { all: ["departamentos"] as const };

function mensajeError(error: unknown): string {
  return error instanceof ApiError ? error.message : "Ocurrió un error inesperado. Intenta de nuevo.";
}

export function useDepartamentos() {
  const { estaAutenticado } = useAuth();
  return useQuery({
    queryKey: departamentosKeys.all,
    queryFn: api.obtenerDepartamentos,
    enabled: estaAutenticado,
  });
}

export function useCrearDepartamento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (datos: CrearDepartamentoInput) => api.crearDepartamento(datos),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: departamentosKeys.all }),
    onError: (error) => toast.error(mensajeError(error)),
  });
}

export function useActualizarDepartamento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: ActualizarDepartamentoInput }) =>
      api.actualizarDepartamento(id, datos),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: departamentosKeys.all }),
    onError: (error) => toast.error(mensajeError(error)),
  });
}
