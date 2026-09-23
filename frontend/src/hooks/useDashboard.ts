// Hook de TanStack Query para el dashboard (Fase 6) — mismo criterio que useSla.ts. Un único GET,
// sin mutaciones. `retry: false`: un `hasta` anterior a `desde` devuelve 400 VALIDATION_ERROR real
// del backend, que no se arregla reintentando (mismo criterio que useTicketPublico en
// usePortal.ts para su propio 401).
import { useQuery } from "@tanstack/react-query";
import { obtenerDashboard } from "@/lib/api/dashboard";
import type { DashboardFiltros } from "@/lib/api/dashboard";
import { useAuth } from "@/lib/auth/AuthProvider";

export function useDashboard(filtros?: DashboardFiltros) {
  const { estaAutenticado } = useAuth();
  return useQuery({
    queryKey: ["dashboard", filtros ?? {}],
    queryFn: () => obtenerDashboard(filtros),
    enabled: estaAutenticado,
    retry: false,
  });
}
