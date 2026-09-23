// Hooks de TanStack Query para Temas de ayuda (Fase B1) — mismo criterio que
// src/hooks/useDepartamentos.ts: un hook por operación, `toast.error` en la mutación.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import * as api from "@/lib/api/temasAyuda";
import type { ActualizarTemaAyudaInput, CrearTemaAyudaInput } from "@/lib/api/temasAyuda";
import { useAuth } from "@/lib/auth/AuthProvider";

const temasAyudaKeys = { all: ["temasAyuda"] as const };

function mensajeError(error: unknown): string {
  return error instanceof ApiError ? error.message : "Ocurrió un error inesperado. Intenta de nuevo.";
}

export function useTemasAyuda() {
  const { estaAutenticado } = useAuth();
  return useQuery({
    queryKey: temasAyudaKeys.all,
    queryFn: api.obtenerTemasAyuda,
    enabled: estaAutenticado,
  });
}

export function useCrearTemaAyuda() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (datos: CrearTemaAyudaInput) => api.crearTemaAyuda(datos),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: temasAyudaKeys.all }),
    onError: (error) => toast.error(mensajeError(error)),
  });
}

export function useActualizarTemaAyuda() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: ActualizarTemaAyudaInput }) =>
      api.actualizarTemaAyuda(id, datos),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: temasAyudaKeys.all }),
    onError: (error) => toast.error(mensajeError(error)),
  });
}
