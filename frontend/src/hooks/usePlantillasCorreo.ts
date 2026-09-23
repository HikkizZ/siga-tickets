// Hooks de TanStack Query para Plantillas de correo (Fase B2) — mismo criterio que
// src/hooks/useCorreoConfig.ts: un hook por operación, `toast.success`/`toast.error` en la
// mutación.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import * as api from "@/lib/api/plantillasCorreo";
import type { ActualizarPlantillaCorreoInput, NombrePlantilla } from "@/lib/api/plantillasCorreo";
import { useAuth } from "@/lib/auth/AuthProvider";

const plantillasCorreoKeys = { all: ["plantillasCorreo"] as const };

function mensajeError(error: unknown): string {
  return error instanceof ApiError ? error.message : "Ocurrió un error inesperado. Intenta de nuevo.";
}

export function usePlantillasCorreo() {
  const { estaAutenticado } = useAuth();
  return useQuery({
    queryKey: plantillasCorreoKeys.all,
    queryFn: api.obtenerPlantillasCorreo,
    enabled: estaAutenticado,
  });
}

export function useActualizarPlantillaCorreo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ nombre, datos }: { nombre: NombrePlantilla; datos: ActualizarPlantillaCorreoInput }) =>
      api.actualizarPlantillaCorreo(nombre, datos),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: plantillasCorreoKeys.all });
      toast.success("Plantilla guardada.");
    },
    onError: (error) => toast.error(mensajeError(error)),
  });
}
