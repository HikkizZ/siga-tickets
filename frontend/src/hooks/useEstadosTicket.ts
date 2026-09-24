// Hooks de TanStack Query para EstadoTicket (Fase C) — mismo criterio que usePrioridades.ts. El
// PATCH puede fallar con 400 ESTADO_TICKET_SIN_REEMPLAZO (docs/api.md: `esEstadoInicial`/
// `esDestinoReapertura` son exclusivos, no se puede dejar el catálogo sin ninguna fila con el
// flag) — el mensaje del backend ya es legible, así que el `toast.error(mensajeError(error))`
// genérico alcanza, sin necesitar un caso especial para ese código.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import * as api from "@/lib/api/estadosTicket";
import type { ActualizarEstadoTicketInput, CrearEstadoTicketInput } from "@/lib/api/estadosTicket";
import { useAuth } from "@/lib/auth/AuthProvider";

const estadosTicketKeys = { all: ["estadosTicket"] as const };

function mensajeError(error: unknown): string {
  return error instanceof ApiError ? error.message : "Ocurrió un error inesperado. Intenta de nuevo.";
}

export function useEstadosTicket() {
  const { estaAutenticado } = useAuth();
  return useQuery({
    queryKey: estadosTicketKeys.all,
    queryFn: api.obtenerEstadosTicket,
    enabled: estaAutenticado,
  });
}

export function useCrearEstadoTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (datos: CrearEstadoTicketInput) => api.crearEstadoTicket(datos),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: estadosTicketKeys.all }),
    onError: (error) => toast.error(mensajeError(error)),
  });
}

export function useActualizarEstadoTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: ActualizarEstadoTicketInput }) =>
      api.actualizarEstadoTicket(id, datos),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: estadosTicketKeys.all }),
    onError: (error) => toast.error(mensajeError(error)),
  });
}
