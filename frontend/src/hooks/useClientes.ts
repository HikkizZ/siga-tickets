import { useQuery } from "@tanstack/react-query";
import { obtenerClientes } from "@/lib/api/clientes";
import { useAuth } from "@/lib/auth/AuthProvider";

/** Lista de clientes reales del backend (GET /clientes, rol mínimo lectura). */
export function useClientes() {
  const { estaAutenticado } = useAuth();
  return useQuery({
    queryKey: ["clientes"],
    queryFn: obtenerClientes,
    enabled: estaAutenticado,
  });
}
