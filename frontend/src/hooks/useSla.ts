// Hooks de TanStack Query para SLA (Fase 4) — mismo criterio que src/hooks/useOts.ts: un hook
// por operación. `useActualizarSlaConfig` invalida además "ots" y "tickets": el backend
// recalcula en la misma transacción el vencimiento de toda OT/ticket abierto de la prioridad
// editada (docs/api.md), así que las vistas de OT/tickets no deben quedar con un SLA vencido
// desactualizado.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import * as api from "@/lib/api/sla";
import type { ActualizarSlaConfigFila, CrearFeriadoInput } from "@/lib/api/sla";
import { useAuth } from "@/lib/auth/AuthProvider";

const slaKeys = {
  config: ["sla", "config"] as const,
  feriados: ["sla", "feriados"] as const,
};

function mensajeError(error: unknown): string {
  return error instanceof ApiError ? error.message : "Ocurrió un error inesperado. Intenta de nuevo.";
}

export function useSlaConfig() {
  const { estaAutenticado } = useAuth();
  return useQuery({
    queryKey: slaKeys.config,
    queryFn: api.obtenerSlaConfig,
    enabled: estaAutenticado,
  });
}

export function useActualizarSlaConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (configs: ActualizarSlaConfigFila[]) => api.actualizarSlaConfig(configs),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: slaKeys.config });
      queryClient.invalidateQueries({ queryKey: ["ots"] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      toast.success("Configuración de SLA guardada.");
    },
    onError: (error) => toast.error(mensajeError(error)),
  });
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
