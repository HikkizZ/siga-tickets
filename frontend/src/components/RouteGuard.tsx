// Protección de rutas del panel interno. El proyecto no usa beforeLoad/loader en ninguna ruta
// (revisado: routeTree.gen.ts, router.tsx y cada archivo en src/routes/ no lo hacen — todo se
// resuelve en el cliente), así que esto sigue el mismo patrón: un guard a nivel de componente,
// no un mecanismo nuevo de router. El AuthProvider guarda el token en localStorage, que no existe
// durante el render de servidor (TanStack Start hace SSR), por eso `cargando` empieza en true
// tanto en servidor como en cliente y solo se resuelve después de montar — sin eso habría un
// parpadeo de contenido protegido o un mismatch de hidratación.
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";

// El portal público de la mesa de ayuda es público por diseño (docs/frontend-diseno.md, Fase 5):
// nunca exige sesión. /login tampoco, obviamente.
function esRutaPublica(pathname: string): boolean {
  return pathname.startsWith("/login") || pathname.startsWith("/mesa-de-ayuda");
}

export function RouteGuard({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { estaAutenticado, cargando } = useAuth();
  const navigate = useNavigate();
  const publica = esRutaPublica(pathname);

  useEffect(() => {
    if (publica || cargando || estaAutenticado) return;
    void navigate({ to: "/login", replace: true });
  }, [publica, cargando, estaAutenticado, navigate]);

  if (publica) return <>{children}</>;

  // Mientras se valida la sesión, o si no hay sesión (el efecto de arriba ya está redirigiendo),
  // no se renderiza el contenido protegido ni el shell con datos de un usuario que no existe.
  if (cargando || !estaAutenticado) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Cargando sesión…
      </div>
    );
  }

  return <>{children}</>;
}
