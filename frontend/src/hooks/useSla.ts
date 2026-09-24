// Hooks de TanStack Query para SLA (Fase 4) — mismo criterio que src/hooks/useOts.ts: un hook
// por operación.
//
// Fase C: useSlaConfig/useActualizarSlaConfig se retiraron junto con GET/PUT /sla/config — ver
// src/hooks/usePrioridades.ts (useActualizarPrioridad) para el reemplazo del recálculo de SLA por
// prioridad.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import * as api from "@/lib/api/sla";
import type { CrearFeriadoInput } from "@/lib/api/sla";
import { useAuth } from "@/lib/auth/AuthProvider";

const slaKeys = {
  feriados: ["sla", "feriados"] as const,
};

function mensajeError(error: unknown): string {
  return error instanceof ApiError ? error.message : "Ocurrió un error inesperado. Intenta de nuevo.";
}

export function useFeriados() {
  const { estaAutenticado } = useAuth();
  return useQuery({
    queryKey: slaKeys.feriados,
    queryFn: api.obtenerFeriados,
    enabled: estaAutenticado,
  });
}

export function useCrearFeriado() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (datos: CrearFeriadoInput) => api.crearFeriado(datos),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: slaKeys.feriados }),
    onError: (error) => toast.error(mensajeError(error)),
  });
}

export function useEliminarFeriado() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fecha: string) => api.eliminarFeriado(fecha),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: slaKeys.feriados }),
    onError: (error) => toast.error(mensajeError(error)),
  });
}
