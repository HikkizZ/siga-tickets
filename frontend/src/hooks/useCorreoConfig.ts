// Hooks de TanStack Query para la configuración de correo (Fase A, docs/api.md sección
// "Configuración de correo (Fase A)"). Mismo criterio que src/hooks/useSla.ts: un hook por
// operación, `toast.error`/`toast.success` en la mutación.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import * as api from "@/lib/api/correoConfig";
import type { ActualizarCorreoConfigInput } from "@/lib/api/correoConfig";
import { useAuth } from "@/lib/auth/AuthProvider";

const correoConfigKeys = {
  config: ["correo", "config"] as const,
};

function mensajeError(error: unknown): string {
  return error instanceof ApiError ? error.message : "Ocurrió un error inesperado. Intenta de nuevo.";
}

export function useCorreoConfig() {
  const { estaAutenticado } = useAuth();
  return useQuery({
    queryKey: correoConfigKeys.config,
    queryFn: api.obtenerCorreoConfig,
    enabled: estaAutenticado,
  });
}

export function useActualizarCorreoConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cambios: ActualizarCorreoConfigInput) => api.actualizarCorreoConfig(cambios),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: correoConfigKeys.config });
      toast.success("Configuración de correo guardada.");
    },
    onError: (error) => toast.error(mensajeError(error)),
  });
}
