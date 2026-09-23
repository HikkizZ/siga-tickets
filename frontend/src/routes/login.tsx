import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { ArrowRight, Lock, Mail, TriangleAlert, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Iniciar sesión · Taller OT" },
      {
        name: "description",
        content: "Acceso al panel interno de seguimiento de órdenes de trabajo, cotizaciones y correos.",
      },
      { property: "og:title", content: "Iniciar sesión · Taller OT" },
      {
        property: "og:description",
        content: "Ingresa al panel interno de Taller OT para revisar el tablero de órdenes de trabajo.",
      },
    ],
  }),
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function manejarSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await login(usuario, clave);
      if (typeof window !== "undefined") sessionStorage.setItem("mostrar-resumen", "1");
      await navigate({ to: "/" });
    } catch (err) {
      // ApiError.message ya viene en español desde el backend (p. ej. credenciales inválidas,
      // demasiados intentos); cualquier otro error (red caída, etc.) usa un mensaje genérico.
      setError(err instanceof ApiError ? err.message : "No se pudo conectar con el servidor. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <div className="hidden flex-1 flex-col justify-between bg-nav p-10 text-nav-foreground lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-md bg-primary">
            <Wrench className="size-4 text-primary-foreground" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Taller OT</p>
            <p className="text-[11px] text-nav-muted">Seguimiento interno</p>
          </div>
        </div>
        <div className="max-w-sm">
          <h2 className="text-2xl font-semibold leading-snug">
            Cada orden de trabajo, cotización y correo en un solo lugar.
          </h2>
          <p className="mt-3 text-sm text-nav-muted">
            Tablero por estado, línea de tiempo, horas trabajadas y avisos del día para todo el equipo.
          </p>
        </div>
        <p className="font-mono text-[11px] text-nav-muted">Uso interno · versión de demostración</p>
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2.5 lg:hidden">
            <span className="flex size-9 items-center justify-center rounded-md bg-primary">
              <Wrench className="size-4 text-primary-foreground" />
            </span>
            <p className="text-sm font-semibold">Taller OT</p>
          </div>
          <h1 className="mt-6 text-xl font-semibold lg:mt-0">Iniciar sesión</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Usa tu cuenta corporativa para entrar al tablero.
          </p>

          <form className="mt-7 space-y-4" onSubmit={(e) => void manejarSubmit(e)}>
            <div className="space-y-1.5">
              <Label htmlFor="usuario" className="text-xs">
                Usuario
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="usuario"
                  type="text"
                  autoComplete="username"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  className="h-10 pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clave" className="text-xs">
                Contraseña
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="clave"
                  type="password"
                  autoComplete="current-password"
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                  placeholder="••••••••"
                  className="h-10 pl-9"
                />
              </div>
            </div>
            {error && (
              <p className="flex items-center gap-1.5 text-sm text-alta" role="alert">
                <TriangleAlert className="size-4 shrink-0" /> {error}
              </p>
            )}
            <Button type="submit" className="h-10 w-full" disabled={enviando}>
              {enviando ? "Ingresando…" : "Iniciar sesión"} <ArrowRight className="size-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
