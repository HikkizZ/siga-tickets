// Hooks de TanStack Query para Cotizaciones (Fase 2) — mismo criterio que src/hooks/useOts.ts:
// un hook por operación, y cada mutación invalida el árbol completo bajo "cotizaciones". También
// invalida "ots": una cotización se embebe en GET /ots/:id (ot.cotizaciones), así que crear,
// editar o cambiar el estado de una cotización con OT debe refrescar también su detalle.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import * as api from "@/lib/api/cotizaciones";
import type { ActualizarCotizacionInput, CotizacionesFiltros, CrearCotizacionInput } from "@/lib/api/cotizaciones";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { EstadoCotizacion } from "@/lib/labels";

const cotizacionKeys = {
  all: ["cotizaciones"] as const,
  list: (filtros?: CotizacionesFiltros) => [...cotizacionKeys.all, "list", filtros ?? {}] as const,
  detail: (id: string) => [...cotizacionKeys.all, "detail", id] as const,
};

function mensajeError(error: unknown): string {
  return error instanceof ApiError ? error.message : "Ocurrió un error inesperado. Intenta de nuevo.";
}

function useInvalidarCotizaciones() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: cotizacionKeys.all });
    queryClient.invalidateQueries({ queryKey: ["ots"] });
  };
}

export function useCotizaciones(filtros?: CotizacionesFiltros) {
  const { estaAutenticado } = useAuth();
  return useQuery({
    queryKey: cotizacionKeys.list(filtros),
    queryFn: () => api.obtenerCotizaciones(filtros),
    enabled: estaAutenticado,
  });
}

export function useCotizacion(id: string | null) {
  const { estaAutenticado } = useAuth();
  return useQuery({
    queryKey: cotizacionKeys.detail(id ?? ""),
    queryFn: () => api.obtenerCotizacion(id!),
    enabled: estaAutenticado && !!id,
  });
}

export function useCrearCotizacion() {
  const invalidar = useInvalidarCotizaciones();
  return useMutation({
    mutationFn: (input: CrearCotizacionInput) => api.crearCotizacion(input),
    onSuccess: () => invalidar(),
    onError: (error) => toast.error(mensajeError(error)),
  });
}

export function useActualizarCotizacion() {
  const invalidar = useInvalidarCotizaciones();
  return useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: ActualizarCotizacionInput }) => api.actualizarCotizacion(id, datos),
    onSuccess: () => invalidar(),
    onError: (error) => toast.error(mensajeError(error)),
  });
}

export function useCambiarEstadoCotizacion() {
  const invalidar = useInvalidarCotizaciones();
  return useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: EstadoCotizacion }) => api.cambiarEstadoCotizacion(id, estado),
    onSuccess: () => invalidar(),
    onError: (error) => toast.error(mensajeError(error)),
  });
}
