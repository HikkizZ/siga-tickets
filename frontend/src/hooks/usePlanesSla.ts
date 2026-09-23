// Hooks de TanStack Query para Planes SLA (Fase B2) — mismo criterio que src/hooks/useSla.ts:
// un hook por operación. A diferencia de sla_config, un plan sí se borra de verdad
// (useEliminarPlanSla), y ningún cálculo real de SLA de OT/ticket lo usa todavía, así que la
// mutación no necesita invalidar "ots"/"tickets" (a diferencia de useActualizarSlaConfig).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import * as api from "@/lib/api/planesSla";
import type { ActualizarPlanSlaInput, CrearPlanSlaInput } from "@/lib/api/planesSla";
import { useAuth } from "@/lib/auth/AuthProvider";

const planesSlaKeys = { all: ["planesSla"] as const };

function mensajeError(error: unknown): string {
  return error instanceof ApiError ? error.message : "Ocurrió un error inesperado. Intenta de nuevo.";
}

export function usePlanesSla() {
  const { estaAutenticado } = useAuth();
  return useQuery({
    queryKey: planesSlaKeys.all,
    queryFn: api.obtenerPlanesSla,
    enabled: estaAutenticado,
  });
}

export function useCrearPlanSla() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (datos: CrearPlanSlaInput) => api.crearPlanSla(datos),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: planesSlaKeys.all }),
    onError: (error) => toast.error(mensajeError(error)),
  });
}

export function useActualizarPlanSla() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: ActualizarPlanSlaInput }) =>
      api.actualizarPlanSla(id, datos),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: planesSlaKeys.all }),
    onError: (error) => toast.error(mensajeError(error)),
  });
}

export function useEliminarPlanSla() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.eliminarPlanSla(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: planesSlaKeys.all });
      toast.success("Plan SLA eliminado.");
    },
    onError: (error) => toast.error(mensajeError(error)),
  });
}
