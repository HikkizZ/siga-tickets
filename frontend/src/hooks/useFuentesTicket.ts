// Hooks de TanStack Query para CanalTicket / "Fuentes de ticket" (Fase C) — mismo criterio que
// usePrioridades.ts / useEstadosTicket.ts.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import * as api from "@/lib/api/fuentesTicket";
import type { ActualizarFuenteTicketInput, CrearFuenteTicketInput } from "@/lib/api/fuentesTicket";
import { useAuth } from "@/lib/auth/AuthProvider";

const fuentesTicketKeys = { all: ["fuentesTicket"] as const };

function mensajeError(error: unknown): string {
  return error instanceof ApiError ? error.message : "Ocurrió un error inesperado. Intenta de nuevo.";
}

export function useFuentesTicket() {
  const { estaAutenticado } = useAuth();
  return useQuery({
    queryKey: fuentesTicketKeys.all,
    queryFn: api.obtenerFuentesTicket,
    enabled: estaAutenticado,
  });
}

export function useCrearFuenteTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (datos: CrearFuenteTicketInput) => api.crearFuenteTicket(datos),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: fuentesTicketKeys.all }),
    onError: (error) => toast.error(mensajeError(error)),
  });
}

export function useActualizarFuenteTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: ActualizarFuenteTicketInput }) =>
      api.actualizarFuenteTicket(id, datos),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: fuentesTicketKeys.all }),
    onError: (error) => toast.error(mensajeError(error)),
  });
}
