// Reemplaza el usuarioActual fijo del mock (mock-data.ts) por el usuario real de la sesión.
// Ver docs/frontend-diseno.md — decisiones de arquitectura, sección Auth.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { clearToken, getToken, setToken } from "./token";

/** Espejo de Rol en backend/src/entities/enums.ts (admin ⊇ gestion ⊇ tecnico ⊇ lectura). */
export type Rol = "admin" | "gestion" | "tecnico" | "lectura";

/** Espejo del `Usuario` documentado en docs/api.md (sección Auth). */
export type Usuario = {
  id: string;
  username: string;
  nombre: string;
  cargo: string | null;
  email: string;
  rol: Rol;
  activo: boolean;
  mustChangePassword: boolean;
  creadoEn: string;
  actualizadoEn: string;
};

type AuthContextValue = {
  usuario: Usuario | null;
  estaAutenticado: boolean;
  /** true mientras se valida la sesión guardada (GET /auth/me) al montar la app. */
  cargando: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
};

// Misma instancia entre recargas en caliente (HMR), igual que OTContext en ot-store.tsx.
const globalRef = globalThis as { __authContext?: React.Context<AuthContextValue | null> };
const AuthContext = (globalRef.__authContext ??= createContext<AuthContextValue | null>(null));

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);
  const queryClient = useQueryClient();

  // Al montar: si hay un token guardado, se valida contra el backend y se trae el usuario real.
  // Si el token es inválido o venció, se limpia y se sigue como sesión no iniciada (sin crashear).
  useEffect(() => {
    let cancelado = false;

    async function validarSesionGuardada() {
      if (!getToken()) {
        setCargando(false);
        return;
      }
      try {
        const { data } = await apiClient.get<{ user: Usuario }>("/auth/me");
        if (!cancelado) setUsuario(data.user);
      } catch {
        clearToken();
        if (!cancelado) setUsuario(null);
      } finally {
        if (!cancelado) setCargando(false);
      }
    }

    void validarSesionGuardada();
    return () => {
      cancelado = true;
    };
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      // POST /auth/login ya devuelve { token, user } — no hace falta un GET /auth/me adicional.
      const { data } = await apiClient.post<{ token: string; user: Usuario }>(
        "/auth/login",
        { username, password },
        { auth: false },
      );
      // Limpia cualquier dato cacheado de una sesión anterior en la misma pestaña (Fase 4: se
      // detectó que, sin esto, el popover de notificaciones podía mostrar por un instante los
      // datos cacheados del usuario que acaba de cerrar sesión — TanStack Query no sabe por sí
      // solo que cambió el usuario autenticado, ya que las query keys no incluyen su id).
      queryClient.clear();
      setToken(data.token);
      setUsuario(data.user);
    },
    [queryClient],
  );

  const logout = useCallback(() => {
    clearToken();
    setUsuario(null);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({ usuario, estaAutenticado: usuario !== null, cargando, login, logout }),
    [usuario, cargando, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
