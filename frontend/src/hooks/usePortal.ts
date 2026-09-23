// Hooks de TanStack Query para el portal público (Fase 5), mismo criterio que useTickets.ts /
// useOts.ts. Sin invalidación cruzada con el árbol interno ["tickets"]/["ots"]: el portal no
// comparte caché con el panel (usuarios distintos, sin sesión), cada mutación solo maneja su
// propio estado.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import * as api from "@/lib/api/portal";
import type { CrearTicketPublicoInput, SolicitarSeguimientoInput } from "@/lib/api/portal";
import { setPortalToken } from "@/lib/portal/token";

const portalKeys = {
  ticket: (token: string) => ["portal", "ticket", token] as const,
};

function mensajeError(error: unknown): string {
  return error instanceof ApiError ? error.message : "Ocurrió un error inesperado. Intenta de nuevo.";
}

export function useCrearTicketPublico() {
  return useMutation({
    mutationFn: (input: CrearTicketPublicoInput) => api.crearTicketPublico(input),
    onError: (error) => toast.error(mensajeError(error)),
  });
}

/** Al obtener el token, lo guarda de inmediato (junto al número consultado) para que la vista de
 * detalle lo encuentre sin que el llamador tenga que hacerlo aparte. */
export function useSolicitarSeguimiento() {
  return useMutation({
    mutationFn: (input: SolicitarSeguimientoInput) => api.solicitarSeguimiento(input),
    onSuccess: (data, variables) => setPortalToken(data.token, variables.numero),
  });
}

/** `retry: false`: un token inválido o expirado (401) nunca se arregla reintentando. El
 * llamador decide qué hacer con el error (volver al formulario de búsqueda). */
export function useTicketPublico(portalToken: string | null) {
  return useQuery({
    queryKey: portalKeys.ticket(portalToken ?? ""),
    queryFn: () => api.obtenerTicketPublico(portalToken!),
    enabled: !!portalToken,
    retry: false,
  });
}

export function useResponderComoClientePublico() {
  return useMutation({
    mutationFn: ({ portalToken, cuerpo, archivos }: { portalToken: string; cuerpo: string; archivos?: File[] }) =>
      api.responderComoClientePublico(portalToken, cuerpo, archivos),
    onError: (error) => toast.error(mensajeError(error)),
  });
}

export function useAdjuntarArchivoPublico() {
  return useMutation({
    mutationFn: ({ portalToken, archivo }: { portalToken: string; archivo: File }) =>
      api.adjuntarArchivoPublico(portalToken, archivo),
    onError: (error) => toast.error(mensajeError(error)),
  });
}

/** Limpia del caché de React Query el detalle del ticket portal (por token) — se usa al volver al
 * formulario de búsqueda (token limpiado o expirado) para no dejar datos viejos servidos. */
export function useLimpiarCachePortal() {
  const queryClient = useQueryClient();
  return (portalToken: string) => queryClient.removeQueries({ queryKey: portalKeys.ticket(portalToken) });
}
