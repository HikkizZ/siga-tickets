// Hooks de TanStack Query para Tickets (Fase 3) — un hook por operación, mismo criterio que
// useOts.ts / useCotizaciones.ts. Convertir/vincular/desvincular una OT también invalidan "ots":
// convertir crea una OT nueva y vincular/desvincular cambian `ot.tickets` embebido en
// GET /ots/:id, así que el detalle de OT no puede quedarse con la copia vieja si está abierto.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import * as api from "@/lib/api/tickets";
import type {
  ActualizarTicketInput,
  ConvertirTicketAOtInput,
  CrearMensajeInput,
  CrearTicketInput,
  DerivarTicketInput,
  TicketsFiltros,
} from "@/lib/api/tickets";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { EstadoTicket } from "@/lib/labels";

const ticketKeys = {
  all: ["tickets"] as const,
  list: (filtros?: TicketsFiltros) => [...ticketKeys.all, "list", filtros ?? {}] as const,
  detail: (id: string) => [...ticketKeys.all, "detail", id] as const,
};

function mensajeError(error: unknown): string {
  return error instanceof ApiError ? error.message : "Ocurrió un error inesperado. Intenta de nuevo.";
}

function useInvalidarTickets() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ticketKeys.all });
}

function useInvalidarTicketsYOts() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ticketKeys.all });
    queryClient.invalidateQueries({ queryKey: ["ots"] });
  };
}

export function useTickets(filtros?: TicketsFiltros) {
  const { estaAutenticado } = useAuth();
  return useQuery({
    queryKey: ticketKeys.list(filtros),
    queryFn: () => api.obtenerTickets(filtros),
    enabled: estaAutenticado,
  });
}

export function useTicket(id: string | null) {
  const { estaAutenticado } = useAuth();
  return useQuery({
    queryKey: ticketKeys.detail(id ?? ""),
    queryFn: () => api.obtenerTicket(id!),
    enabled: estaAutenticado && !!id,
  });
}

export function useCrearTicket() {
  const invalidar = useInvalidarTickets();
  return useMutation({
    mutationFn: (input: CrearTicketInput) => api.crearTicket(input),
    onSuccess: () => invalidar(),
    onError: (error) => toast.error(mensajeError(error)),
  });
}

export function useActualizarTicket() {
  const invalidar = useInvalidarTickets();
  return useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: ActualizarTicketInput }) => api.actualizarTicket(id, datos),
    onSuccess: () => invalidar(),
    onError: (error) => toast.error(mensajeError(error)),
  });
}

export function useCambiarEstadoTicket() {
  const invalidar = useInvalidarTickets();
  return useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: EstadoTicket }) => api.cambiarEstadoTicket(id, estado),
    onSuccess: () => invalidar(),
    onError: (error) => toast.error(mensajeError(error)),
  });
}

export function useTomarTicket() {
  const invalidar = useInvalidarTickets();
  return useMutation({
    mutationFn: (id: string) => api.tomarTicket(id),
    onSuccess: () => {
      invalidar();
      toast.success("Tomaste el ticket.");
    },
    onError: (error) => toast.error(mensajeError(error)),
  });
}

export function useAgregarMensajeTicket() {
  const invalidar = useInvalidarTickets();
  return useMutation({
    mutationFn: ({ id, ...datos }: { id: string } & CrearMensajeInput) => api.agregarMensajeTicket(id, datos),
    onSuccess: () => invalidar(),
    onError: (error) => toast.error(mensajeError(error)),
  });
}

export function useDerivarTicket() {
  const invalidar = useInvalidarTickets();
  return useMutation({
    mutationFn: ({ id, ...datos }: { id: string } & DerivarTicketInput) => api.derivarTicket(id, datos),
    onSuccess: () => {
      invalidar();
      toast.success("Ticket derivado correctamente.");
    },
    onError: (error) => toast.error(mensajeError(error)),
  });
}

export function useConvertirTicketAOt() {
  const invalidar = useInvalidarTicketsYOts();
  return useMutation({
    mutationFn: ({ id, ...datos }: { id: string } & ConvertirTicketAOtInput) => api.convertirTicketAOt(id, datos),
    onSuccess: () => {
      invalidar();
      toast.success("Ticket convertido en OT.");
    },
    onError: (error) => toast.error(mensajeError(error)),
  });
}

export function useVincularOtATicket() {
  const invalidar = useInvalidarTicketsYOts();
  return useMutation({
    mutationFn: ({ id, otId }: { id: string; otId: string }) => api.vincularOtATicket(id, otId),
    onSuccess: () => {
      invalidar();
      toast.success("OT vinculada correctamente.");
    },
    onError: (error) => toast.error(mensajeError(error)),
  });
}

export function useDesvincularOtDeTicket() {
  const invalidar = useInvalidarTicketsYOts();
  return useMutation({
    mutationFn: ({ id, otId }: { id: string; otId: string }) => api.desvincularOtDeTicket(id, otId),
    onSuccess: () => invalidar(),
    onError: (error) => toast.error(mensajeError(error)),
  });
}

export function useSubirAdjuntoTicket() {
  const invalidar = useInvalidarTickets();
  return useMutation({
    mutationFn: ({ id, archivo }: { id: string; archivo: File }) => api.subirAdjuntoTicket(id, archivo),
    onSuccess: () => invalidar(),
    onError: (error) => toast.error(mensajeError(error)),
  });
}
