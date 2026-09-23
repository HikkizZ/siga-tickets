import { useQuery } from "@tanstack/react-query";
import { obtenerUsuarios } from "@/lib/api/usuarios";
import { useAuth } from "@/lib/auth/AuthProvider";

/** Lista de usuarios reales del backend. Requiere sesión (GET /usuarios exige rol admin). */
export function useUsuarios() {
  const { estaAutenticado } = useAuth();
  return useQuery({
    queryKey: ["usuarios"],
    queryFn: obtenerUsuarios,
    enabled: estaAutenticado,
  });
}
