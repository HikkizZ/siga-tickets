// Directorio de clientes (Fase E2, docs/api.md sección "Clientes"). Catálogo simple: tabla +
// formulario de creación + toggle activo/inactivo por fila, mismo patrón que la sección
// "Departamentos" de /configuracion (src/components/configuracion/SeccionDepartamentos.tsx). Sin
// DELETE (no existe en el backend) y sin campos que el backend no tiene (id, nombre, activo
// nada más — sin contacto, teléfono ni dirección).
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Building2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useActualizarCliente, useCrearCliente, useClientes } from "@/hooks/useClientes";
import { puedeEscribirClientes } from "@/lib/labels";
import { useAuth } from "@/lib/auth/AuthProvider";

export const Route = createFileRoute("/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes · Taller OT" },
      {
        name: "description",
        content: "Directorio de clientes: nombre y estado activo/inactivo, usado en OT, tickets y cotizaciones.",
      },
      { property: "og:title", content: "Clientes · Taller OT" },
      {
        property: "og:description",
        content: "Directorio de clientes del taller: crea y desactiva clientes usados en OT, tickets y cotizaciones.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Clientes,
});

function Clientes() {
  const { usuario } = useAuth();
  const puedeEscribir = puedeEscribirClientes(usuario?.rol ?? "lectura");

  const { data: clientes, isLoading, isError } = useClientes();
  const crear = useCrearCliente();
  const actualizar = useActualizarCliente();

  const [nombre, setNombre] = useState("");

  const agregar = () => {
    if (!nombre.trim()) return;
    crear.mutate({ nombre: nombre.trim() }, { onSuccess: () => setNombre("") });
  };

  return (
    <div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Building2 className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Directorio de clientes usado al crear OT, tickets y cotizaciones.
          </p>
        </div>
      </div>

      {!puedeEscribir && (
        <p className="mt-4 flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          <ShieldAlert className="size-4 shrink-0" />
          Solo un administrador puede crear o desactivar clientes. Estás viendo el directorio actual de solo
          lectura.
        </p>
      )}

      <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-card card-elev">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Nombre</th>
              <th className="px-4 py-2.5 font-medium">Activo</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className="px-4 py-3 text-muted-foreground" colSpan={2}>
                  Cargando clientes…
                </td>
              </tr>
            )}
            {isError && (
              <tr>
                <td className="px-4 py-3 text-alta" colSpan={2}>
                  No se pudieron cargar los clientes.
                </td>
              </tr>
            )}
            {clientes?.length === 0 && (
              <tr>
                <td className="px-4 py-3 text-muted-foreground" colSpan={2}>
                  Sin clientes registrados.
                </td>
              </tr>
            )}
            {clientes?.map((c) => (
              <tr key={c.id} className="border-b border-border/70 last:border-0">
                <td className="px-4 py-3">{c.nombre}</td>
                <td className="px-4 py-3">
                  <Switch
                    checked={c.activo}
                    disabled={!puedeEscribir || actualizar.isPending}
                    onCheckedChange={(v) => actualizar.mutate({ id: c.id, datos: { activo: v } })}
                    aria-label={`Activo cliente ${c.nombre}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {puedeEscribir && (
        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card card-elev p-3">
          <div className="min-w-40 flex-1 space-y-1.5">
            <label htmlFor="cliente-nombre" className="text-xs text-muted-foreground">
              Nombre
            </label>
            <Input
              id="cliente-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Minera Los Andes"
              className="h-9"
            />
          </div>
          <Button className="h-9" onClick={agregar} disabled={crear.isPending || !nombre.trim()}>
            Agregar cliente
          </Button>
        </div>
      )}
    </div>
  );
}
