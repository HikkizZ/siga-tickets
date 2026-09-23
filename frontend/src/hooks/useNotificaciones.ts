// Hooks de TanStack Query para Notificaciones (Fase 4) — mismo criterio que src/hooks/useOts.ts.
// Las notificaciones de SLA las genera un cron cada 5 min en el backend (docs/api.md), así que
// no hace falta polling agresivo: 60 s alcanza para que la campana se sienta "viva" sin pegarle
// de más a la API.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import * as api from "@/lib/api/notificaciones";
import type { NotificacionesFiltros } from "@/lib/api/notificaciones";
import { useAuth } from "@/lib/auth/AuthProvider";

const REFETCH_MS = 60_000;

const notificacionKeys = {
  all: ["notificaciones"] as const,
  list: (filtros?: NotificacionesFiltros) => [...notificacionKeys.all, "list", filtros ?? {}] as const,
  noLeidasTotal: ["notificaciones", "no-leidas-total"] as const,
  resumen: ["notificaciones", "resumen"] as const,
};

function mensajeError(error: unknown): string {
  return error instanceof ApiError ? error.message : "Ocurrió un error inesperado. Intenta de nuevo.";
}

export function useNotificaciones(filtros?: NotificacionesFiltros) {
  const { estaAutenticado } = useAuth();
  return useQuery({
    queryKey: notificacionKeys.list(filtros),
    queryFn: () => api.obtenerNotificaciones(filtros),
    enabled: estaAutenticado,
    refetchInterval: REFETCH_MS,
  });
}

/** Conteo exacto de no leídas (independiente del tamaño de página de la lista visible en el
 * popover): pide solo `soloNoLeidas=true` con `perPage=1` y usa `meta.total`, no la cantidad de
 * `data` recibida. */
export function useNotificacionesNoLeidasTotal() {
  const { estaAutenticado } = useAuth();
  return useQuery({
    queryKey: notificacionKeys.noLeidasTotal,
    queryFn: () => api.obtenerNotificaciones({ soloNoLeidas: true, perPage: 1 }),
    enabled: estaAutenticado,
    refetchInterval: REFETCH_MS,
    select: (respuesta) => respuesta.total,
  });
}

export function useResumenNotificaciones(habilitado: boolean) {
  const { estaAutenticado } = useAuth();
  return useQuery({
    queryKey: notificacionKeys.resumen,
    queryFn: api.obtenerResumenNotificaciones,
    enabled: estaAutenticado && habilitado,
  });
}

function useInvalidarNotificaciones() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: notificacionKeys.all });
}

export function useMarcarNotificacionLeida() {
  const invalidar = useInvalidarNotificaciones();
  return useMutation({
    mutationFn: (id: string) => api.marcarNotificacionLeida(id),
    onSuccess: () => invalidar(),
    onError: (error) => toast.error(mensajeError(error)),
  });
}

export function useMarcarTodasNotificacionesLeidas() {
  const invalidar = useInvalidarNotificaciones();
  return useMutation({
    mutationFn: () => api.marcarTodasNotificacionesLeidas(),
    onSuccess: () => invalidar(),
    onError: (error) => toast.error(mensajeError(error)),
  });
}
