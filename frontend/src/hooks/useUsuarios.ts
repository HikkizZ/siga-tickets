import { useQuery } from "@tanstack/react-query";
import { obtenerUsuarios } from "@/lib/api/usuarios";
import { useAuth } from "@/lib/auth/AuthProvider";

/** Lista de usuarios reales del backend. GET /usuarios exige rol admin en el servidor — se
 * condiciona acá también (no solo `estaAutenticado`) para no disparar una llamada que el backend
 * va a rechazar con 403 en cualquier sesión no-admin (ruido de consola sin ningún dato real que
 * mostrar; ya documentado como comportamiento esperado desde la Fase 0, esto solo evita la
 * llamada de más). */
export function useUsuarios() {
  const { estaAutenticado, usuario } = useAuth();
  return useQuery({
    queryKey: ["usuarios"],
    queryFn: obtenerUsuarios,
    enabled: estaAutenticado && usuario?.rol === "admin",
  });
}
