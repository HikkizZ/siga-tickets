// Hooks de TanStack Query para cuentas de cliente del portal (Fase D), mismo patrón que
// usePortal.ts. Sin invalidación cruzada con el árbol interno ["tickets"]/["ots"] ni con el
// portal por ticket ["portal", ...] (mundos separados, sin caché compartido).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import * as api from "@/lib/api/portalCuenta";
import type { LoginCuentaInput, RegistrarCuentaInput } from "@/lib/api/portalCuenta";
import { clearCuentaToken, getCuentaToken, setCuentaToken } from "@/lib/portal/cuentaToken";

const cuentaKeys = {
  misTickets: (page: number, perPage: number) => ["portal-cuenta", "mis-tickets", page, perPage] as const,
  ticket: (numero: string) => ["portal-cuenta", "ticket", numero] as const,
};

function mensajeError(error: unknown): string {
  return error instanceof ApiError ? error.message : "Ocurrió un error inesperado. Intenta de nuevo.";
}

// Sin onError con toast: el 409 (correo ya registrado) y el 401 (credenciales inválidas) se
// muestran inline en el formulario, mismo criterio que useSolicitarSeguimiento en usePortal.ts —
// el llamador captura el rechazo de mutateAsync.
export function useRegistrarCuenta() {
  return useMutation({
    mutationFn: (input: RegistrarCuentaInput) => api.registrarCuenta(input),
    onSuccess: (data) => setCuentaToken(data.token),
  });
}

export function useLoginCuenta() {
  return useMutation({
    mutationFn: (input: LoginCuentaInput) => api.loginCuenta(input),
    onSuccess: (data) => setCuentaToken(data.token),
  });
}

/** `retry: false`: un token de cuenta inválido o expirado (401) nunca se arregla reintentando. */
export function useMisTickets(cuentaToken: string | null, page: number, perPage: number) {
  return useQuery({
    queryKey: cuentaKeys.misTickets(page, perPage),
    queryFn: () => api.obtenerMisTickets(cuentaToken!, page, perPage),
    enabled: !!cuentaToken,
    retry: false,
  });
}

export function useDetalleTicketCuenta(cuentaToken: string | null, numero: string | null) {
  return useQuery({
    queryKey: cuentaKeys.ticket(numero ?? ""),
    queryFn: () => api.obtenerDetalleTicketCuenta(cuentaToken!, numero!),
    enabled: !!cuentaToken && !!numero,
    retry: false,
  });
}

export function useResponderTicketCuenta() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      cuentaToken,
      numero,
      cuerpo,
      archivos,
    }: {
      cuentaToken: string;
      numero: string;
      cuerpo: string;
      archivos?: File[];
    }) => api.responderTicketCuenta(cuentaToken, numero, cuerpo, archivos),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: cuentaKeys.ticket(variables.numero) });
    },
    onError: (error) => toast.error(mensajeError(error)),
  });
}

/** Limpia del caché de React Query el detalle de un ticket de cuenta — se usa al cerrar sesión o
 * al detectar un token vencido, para no dejar datos viejos servidos tras volver a entrar. */
export function useLimpiarCacheCuenta() {
  const queryClient = useQueryClient();
  return () => queryClient.removeQueries({ queryKey: ["portal-cuenta"] });
}

/** Guard de sesión de cuenta para las rutas protegidas bajo /mesa-de-ayuda/cuenta (mis-tickets,
 * detalle de ticket): mismo patrón "arranca en null, se resuelve después de montar" que ya usa
 * `Seguimiento` en seguimiento.tsx para el token de portal por ticket — evita el mismatch de
 * hidratación ya documentado en la Fase 5 (el servidor nunca tiene localStorage). Sin token
 * después de revisar, redirige a /mesa-de-ayuda/cuenta/login (mismo criterio que RouteGuard.tsx
 * para el panel interno, pero acá vive junto al resto de los hooks de cuenta, no en ese archivo —
 * es un mecanismo de auth completamente distinto). */
export function useCuentaSesion(): { cuentaToken: string | null; revisado: boolean } {
  const navigate = useNavigate();
  const [cuentaToken, setCuentaTokenLocal] = useState<string | null>(null);
  const [revisado, setRevisado] = useState(false);

  useEffect(() => {
    setCuentaTokenLocal(getCuentaToken());
    setRevisado(true);
  }, []);

  useEffect(() => {
    if (revisado && !cuentaToken) {
      void navigate({ to: "/mesa-de-ayuda/cuenta/login", replace: true });
    }
  }, [revisado, cuentaToken, navigate]);

  return { cuentaToken, revisado };
}

/** Cierra la sesión de cuenta: limpia el token guardado, el caché de React Query asociado, y
 * vuelve a /mesa-de-ayuda (mismo destino que pide el enunciado para el botón "Cerrar sesión"). */
export function useCerrarSesionCuenta() {
  const navigate = useNavigate();
  const limpiarCache = useLimpiarCacheCuenta();
  return () => {
    clearCuentaToken();
    limpiarCache();
    void navigate({ to: "/mesa-de-ayuda" });
  };
}
