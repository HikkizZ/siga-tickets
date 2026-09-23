// Hook de TanStack Query para el buscador global (Fase 6) — mismo criterio que useDashboard.ts.
// `enabled` exige al menos 2 caracteres (mismo umbral que ya usaba el buscador mock en
// AppShell.tsx) para no pegarle a GET /buscar en la primera tecla.
import { useQuery } from "@tanstack/react-query";
import { buscar } from "@/lib/api/buscar";
import { useAuth } from "@/lib/auth/AuthProvider";

export function useBuscar(q: string) {
  const { estaAutenticado } = useAuth();
  const texto = q.trim();
  return useQuery({
    queryKey: ["buscar", texto],
    queryFn: () => buscar(texto),
    enabled: estaAutenticado && texto.length >= 2,
  });
}
