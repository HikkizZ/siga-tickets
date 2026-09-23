// Hooks de TanStack Query para OT (Fase 1) — un hook por operación, mismo criterio que
// useUsuarios/useClientes de la Fase 0. Reemplaza el consumo de ot-store.tsx para datos de OT;
// ot-store.tsx sigue existiendo tal cual para tickets/cotizaciones/SLA/notificaciones (fuera de
// alcance de esta fase).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import * as api from "@/lib/api/ots";
import type {
  ActualizarOtInput,
  AgregarHoraInput,
  CrearOtInput,
  DerivarOtInput,
  EtapaInput,
  OtsFiltros,
  OtsKanbanFiltros,
} from "@/lib/api/ots";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { EstadoOt } from "@/lib/labels";

const otKeys = {
  all: ["ots"] as const,
  kanban: (filtros?: OtsKanbanFiltros) => [...otKeys.all, "kanban", filtros ?? {}] as const,
  list: (filtros?: OtsFiltros) => [...otKeys.all, "list", filtros ?? {}] as const,
  detail: (id: string) => [...otKeys.all, "detail", id] as const,
};

function mensajeError(error: unknown): string {
  return error instanceof ApiError ? error.message : "Ocurrió un error inesperado. Intenta de nuevo.";
}

/** Toda mutación de OT invalida el árbol completo bajo "ots": cubre el detalle, el listado y el
 * kanban a la vez (más simple que invalidar cada query una por una, y evita dejar alguna vista
 * con datos viejos por olvido). */
function useInvalidarOts() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: otKeys.all });
}

export function useOtsKanban(filtros?: OtsKanbanFiltros) {
  const { estaAutenticado } = useAuth();
  return useQuery({
    queryKey: otKeys.kanban(filtros),
    queryFn: () => api.obtenerOtsKanban(filtros),
    enabled: estaAutenticado,
  });
}

export function useOts(filtros?: OtsFiltros) {
  const { estaAutenticado } = useAuth();
  return useQuery({
    queryKey: otKeys.list(filtros),
    queryFn: () => api.obtenerOts(filtros),
    enabled: estaAutenticado,
  });
}

export function useOt(id: string | null) {
  const { estaAutenticado } = useAuth();
  return useQuery({
    queryKey: otKeys.detail(id ?? ""),
    queryFn: () => api.obtenerOt(id!),
    enabled: estaAutenticado && !!id,
  });
}

export function useCrearOt() {
  const invalidar = useInvalidarOts();
  return useMutation({
    mutationFn: (input: CrearOtInput) => api.crearOt(input),
    onSuccess: () => invalidar(),
    onError: (error) => toast.error(mensajeError(error)),
  });
}

export function useActualizarOt() {
  const invalidar = useInvalidarOts();
  return useMutation({
    mutationFn: ({ id, datos }: { id: string; datos: ActualizarOtInput }) => api.actualizarOt(id, datos),
    onSuccess: () => invalidar(),
    onError: (error) => toast.error(mensajeError(error)),
  });
}

export function useCambiarEstadoOt() {
  const invalidar = useInvalidarOts();
  return useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: EstadoOt }) => api.cambiarEstadoOt(id, estado),
    onSuccess: () => invalidar(),
    onError: (error) => toast.error(mensajeError(error)),
  });
}

export function useDerivarOt() {
  const invalidar = useInvalidarOts();
  return useMutation({
    mutationFn: ({ id, ...datos }: { id: string } & DerivarOtInput) => api.derivarOt(id, datos),
    onSuccess: () => {
      invalidar();
      toast.success("OT derivada correctamente.");
    },
    onError: (error) => toast.error(mensajeError(error)),
  });
}

export function useAgregarColaborador() {
  const invalidar = useInvalidarOts();
  return useMutation({
    mutationFn: ({ id, usuarioId }: { id: string; usuarioId: string }) => api.agregarColaborador(id, usuarioId),
    onSuccess: () => invalidar(),
    onError: (error) => toast.error(mensajeError(error)),
  });
}

export function useQuitarColaborador() {
  const invalidar = useInvalidarOts();
  return useMutation({
    mutationFn: ({ id, usuarioId }: { id: string; usuarioId: string }) => api.quitarColaborador(id, usuarioId),
    onSuccess: () => invalidar(),
    onError: (error) => toast.error(mensajeError(error)),
  });
}

export function useAgregarComentario() {
  const invalidar = useInvalidarOts();
  return useMutation({
    mutationFn: ({ id, cuerpo, visibleCliente }: { id: string; cuerpo: string; visibleCliente?: boolean }) =>
      api.agregarComentario(id, { cuerpo, visibleCliente }),
    onSuccess: () => invalidar(),
    onError: (error) => toast.error(mensajeError(error)),
  });
}

export function useAgregarHora() {
  const invalidar = useInvalidarOts();
  return useMutation({
    mutationFn: ({ id, ...datos }: { id: string } & AgregarHoraInput) => api.agregarHora(id, datos),
    onSuccess: () => invalidar(),
    onError: (error) => toast.error(mensajeError(error)),
  });
}

export function useQuitarHora() {
  const invalidar = useInvalidarOts();
  return useMutation({
    mutationFn: ({ id, horaId }: { id: string; horaId: string }) => api.quitarHora(id, horaId),
    onSuccess: () => invalidar(),
    onError: (error) => toast.error(mensajeError(error)),
  });
}

export function useCrearEtapa() {
  const invalidar = useInvalidarOts();
  return useMutation({
    mutationFn: ({ id, etapa }: { id: string; etapa: EtapaInput }) => api.crearEtapa(id, etapa),
    onSuccess: () => invalidar(),
    onError: (error) => toast.error(mensajeError(error)),
  });
}

export function useActualizarEtapa() {
  const invalidar = useInvalidarOts();
  return useMutation({
    mutationFn: ({ id, etapaId, datos }: { id: string; etapaId: string; datos: Partial<EtapaInput> }) =>
      api.actualizarEtapa(id, etapaId, datos),
    onSuccess: () => invalidar(),
    onError: (error) => toast.error(mensajeError(error)),
  });
}

export function useEliminarEtapa() {
  const invalidar = useInvalidarOts();
  return useMutation({
    mutationFn: ({ id, etapaId }: { id: string; etapaId: string }) => api.eliminarEtapa(id, etapaId),
    onSuccess: () => invalidar(),
    onError: (error) => toast.error(mensajeError(error)),
  });
}

export function useSubirAdjunto() {
  const invalidar = useInvalidarOts();
  return useMutation({
    mutationFn: ({ id, archivo }: { id: string; archivo: File }) => api.subirAdjunto(id, archivo),
    onSuccess: () => invalidar(),
    onError: (error) => toast.error(mensajeError(error)),
  });
}
