import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { AlertCircle, ArrowRight, UserPlus } from "lucide-react";
import { PortalLayout } from "@/components/PortalLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/client";
import { useRegistrarCuenta } from "@/hooks/usePortalCuenta";

export const Route = createFileRoute("/mesa-de-ayuda/cuenta/registro")({
  head: () => ({
    meta: [
      { title: "Crear cuenta · Mesa de ayuda · Taller OT" },
      {
        name: "description",
        content: "Crea una cuenta para ver todos tus tickets de soporte en un solo lugar, sin buscarlos uno por uno.",
      },
    ],
  }),
  component: RegistroCuenta,
});

const PASSWORD_MIN = 8;

function RegistroCuenta() {
  const navigate = useNavigate();
  const registrar = useRegistrarCuenta();
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [correoRegistrado, setCorreoRegistrado] = useState(false);

  const contrasenasCoinciden = password === confirmar;
  const listo =
    nombre.trim() !== "" &&
    email.trim() !== "" &&
    password.length >= PASSWORD_MIN &&
    password.length <= 72 &&
    contrasenasCoinciden;

  async function manejarSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCorreoRegistrado(false);
    if (!contrasenasCoinciden) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (!listo) return;
    try {
      await registrar.mutateAsync({ nombre: nombre.trim(), email: email.trim(), password });
      await navigate({ to: "/mesa-de-ayuda/cuenta/mis-tickets" });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setCorreoRegistrado(true);
      }
      setError(err instanceof ApiError ? err.message : "Ocurrió un error inesperado. Intenta de nuevo.");
    }
  }

  return (
    <PortalLayout accion={{ to: "/mesa-de-ayuda", label: "Crear ticket sin cuenta" }}>
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <UserPlus className="size-5 text-primary" /> Crea tu cuenta
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Con una cuenta ves todos tus tickets en un solo lugar, sin tener que buscarlos uno por uno.
      </p>

      <form
        className="mt-6 space-y-5 rounded-xl border border-border bg-card p-5 card-elev sm:p-6"
        onSubmit={(e) => void manejarSubmit(e)}
      >
        <div className="space-y-1.5">
          <Label htmlFor="nombre" className="text-xs">
            Tu nombre
          </Label>
          <Input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required className="h-10" />
        </div>
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
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs">
              Contraseña
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8 a 72 caracteres"
              required
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmar" className="text-xs">
              Confirmar contraseña
            </Label>
            <Input
              id="confirmar"
              type="password"
              autoComplete="new-password"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              required
              className="h-10"
            />
          </div>
        </div>
        {error && (
          <p className="flex items-start gap-2 rounded-lg border border-alta/25 bg-alta-suave px-3 py-2 text-sm text-alta">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>
              {error}
              {correoRegistrado && (
                <>
                  {" "}
                  <Link to="/mesa-de-ayuda/cuenta/login" className="font-medium underline">
                    Inicia sesión
                  </Link>
                  .
                </>
              )}
            </span>
          </p>
        )}
        <Button type="submit" className="h-11 w-full sm:w-auto" disabled={!listo || registrar.isPending}>
          {registrar.isPending ? "Creando cuenta…" : "Crear cuenta"} <ArrowRight className="size-4" />
        </Button>
      </form>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        ¿Ya tienes cuenta?{" "}
        <Link to="/mesa-de-ayuda/cuenta/login" className="font-medium text-primary hover:underline">
          Inicia sesión
        </Link>
      </p>
    </PortalLayout>
  );
}
