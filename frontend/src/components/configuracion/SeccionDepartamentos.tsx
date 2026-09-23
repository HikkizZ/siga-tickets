// Sección "Departamentos" de /configuracion (Fase B1, docs/api.md). Catálogo simple: tabla +
// formulario para crear + toggle activo/inactivo por fila. Sin DELETE (no existe en el backend).
// Mismo estilo visual que SeccionFeriados (src/routes/configuracion.tsx).
import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useActualizarDepartamento, useCrearDepartamento, useDepartamentos } from "@/hooks/useDepartamentos";

export function SeccionDepartamentos({ puedeEscribir }: { puedeEscribir: boolean }) {
  const { data: departamentos, isLoading, isError } = useDepartamentos();
  const crear = useCrearDepartamento();
  const actualizar = useActualizarDepartamento();

  const [nombre, setNombre] = useState("");

  const agregar = () => {
    if (!nombre.trim()) return;
    crear.mutate({ nombre: nombre.trim() }, { onSuccess: () => setNombre("") });
  };

  return (
    <div className="mt-4">
      {!puedeEscribir && (
        <p className="mb-3 flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          <ShieldAlert className="size-4 shrink-0" />
          Solo un administrador puede crear o desactivar departamentos. Estás viendo el catálogo actual de solo
          lectura.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-card card-elev">
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
                  Cargando departamentos…
                </td>
              </tr>
            )}
            {isError && (
              <tr>
                <td className="px-4 py-3 text-alta" colSpan={2}>
                  No se pudieron cargar los departamentos.
                </td>
              </tr>
            )}
            {departamentos?.length === 0 && (
              <tr>
                <td className="px-4 py-3 text-muted-foreground" colSpan={2}>
                  Sin departamentos registrados.
                </td>
              </tr>
            )}
            {departamentos?.map((d) => (
              <tr key={d.id} className="border-b border-border/70 last:border-0">
                <td className="px-4 py-3">{d.nombre}</td>
                <td className="px-4 py-3">
                  <Switch
                    checked={d.activo}
                    disabled={!puedeEscribir || actualizar.isPending}
                    onCheckedChange={(v) => actualizar.mutate({ id: d.id, datos: { activo: v } })}
                    aria-label={`Activo departamento ${d.nombre}`}
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
            <label htmlFor="departamento-nombre" className="text-xs text-muted-foreground">
              Nombre
            </label>
            <Input
              id="departamento-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Soporte técnico"
              className="h-9"
            />
          </div>
          <Button className="h-9" onClick={agregar} disabled={crear.isPending || !nombre.trim()}>
            Agregar departamento
          </Button>
        </div>
      )}
    </div>
  );
}
