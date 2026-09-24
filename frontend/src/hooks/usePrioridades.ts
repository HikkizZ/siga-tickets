// Hooks de TanStack Query para Prioridad (Fase C) — mismo criterio que src/hooks/useDepartamentos.ts:
// un hook por operación, `toast.error` en la mutación. `useActualizarPrioridad` invalida además
// "ots" y "tickets": el backend recalcula en la misma transacción el vencimiento de SLA de lo
// abierto de esta prioridad cuando cambia `planSlaId` (docs/api.md), igual que
// useActualizarSlaConfig / useActualizarPlanSla.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import * as api from "@/lib/api/prioridades";
import type { ActualizarPrioridadInput, CrearPrioridadInput } from "@/lib/api/prioridades";
import { useAuth } from "@/lib/auth/AuthProvider";

const prioridadesKeys = { all: ["prioridades"] as const };

function mensajeError(error: unknown): string {
  return error instanceof ApiError ? error.message : "Ocurrió un error inesperado. Intenta de nuevo.";
}

export function usePrioridades() {
  const { estaAutenticado } = useAuth();
  return useQuery({
    queryKey: prioridadesKeys.all,
    queryFn: api.obtenerPrioridades,
    enabled: estaAutenticado,
  });
}

export function useCrearPrioridad() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (datos: CrearPrioridadInput) => api.crearPrioridad(datos),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: prioridadesKeys.all }),
    onError: (error) => toast.error(mensajeError(error)),
  });
}

export function useActualizarPrioridad() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: ActualizarPrioridadInput }) => api.actualizarPrioridad(id, datos),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: prioridadesKeys.all });
      queryClient.invalidateQueries({ queryKey: ["ots"] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (error) => toast.error(mensajeError(error)),
  });
}
