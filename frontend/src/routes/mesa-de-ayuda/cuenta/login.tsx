import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { ArrowRight, LogIn, TriangleAlert } from "lucide-react";
import { PortalLayout } from "@/components/PortalLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/client";
import { useLoginCuenta } from "@/hooks/usePortalCuenta";

export const Route = createFileRoute("/mesa-de-ayuda/cuenta/login")({
  head: () => ({
    meta: [
      { title: "Iniciar sesión · Mesa de ayuda · Taller OT" },
      {
        name: "description",
        content: "Inicia sesión en tu cuenta de cliente para ver todos tus tickets de soporte.",
      },
    ],
  }),
  component: LoginCuenta,
});

function LoginCuenta() {
  const navigate = useNavigate();
  const login = useLoginCuenta();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function manejarSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login.mutateAsync({ email: email.trim(), password });
      await navigate({ to: "/mesa-de-ayuda/cuenta/mis-tickets" });
    } catch (err) {
      // Mismo mensaje genérico del backend tanto si el correo no existe, la contraseña no
      // coincide o la cuenta está inactiva — nunca se distingue cuál causa fue (docs/api.md).
      setError(err instanceof ApiError ? err.message : "Ocurrió un error inesperado. Intenta de nuevo.");
    }
  }

  return (
    <PortalLayout accion={{ to: "/mesa-de-ayuda", label: "Crear ticket sin cuenta" }}>
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <LogIn className="size-5 text-primary" /> Inicia sesión
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">Entra a tu cuenta para ver todos tus tickets.</p>

      <form
        className="mt-6 space-y-5 rounded-xl border border-border bg-card p-5 card-elev sm:p-6"
        onSubmit={(e) => void manejarSubmit(e)}
      >
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-xs">
            Correo
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-10"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-xs">
            Contraseña
          </Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="h-10"
          />
        </div>
        {error && (
          <p className="flex items-center gap-1.5 text-sm text-alta" role="alert">
            <TriangleAlert className="size-4 shrink-0" /> {error}
          </p>
        )}
        <Button type="submit" className="h-11 w-full sm:w-auto" disabled={login.isPending}>
          {login.isPending ? "Ingresando…" : "Iniciar sesión"} <ArrowRight className="size-4" />
        </Button>
      </form>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        ¿No tienes cuenta?{" "}
        <Link to="/mesa-de-ayuda/cuenta/registro" className="font-medium text-primary hover:underline">
          Regístrate
        </Link>
      </p>
    </PortalLayout>
  );
}
