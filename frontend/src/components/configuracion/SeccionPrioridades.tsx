// Sección "Prioridades" de /configuracion (Fase C, docs/api.md): catálogo compartido por Ticket y
// OT. Tabla con edición inline (nombre, orden, Plan SLA) + toggle activo directo + formulario para
// crear, mismo estilo que SeccionPlanesSla.tsx (edición inline) y SeccionDepartamentos.tsx (sin
// DELETE — se desactiva con `activo`, no hay botón eliminar).
import { useState } from "react";
import { Pencil, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { usePlanesSla } from "@/hooks/usePlanesSla";
import { useActualizarPrioridad, useCrearPrioridad, usePrioridades } from "@/hooks/usePrioridades";
import type { Prioridad } from "@/lib/api/prioridades";

// Sentinel para "sin Plan SLA" en el <Select> (Radix no admite value="") — mismo criterio que
// SIN_DEPARTAMENTO/SIN_PRIORIDAD de SeccionTemasAyuda.tsx.
const SIN_PLAN = "__sin_plan__";

type Borrador = { nombre: string; orden: string; planSlaId: string };

function aBorrador(p: Prioridad): Borrador {
  return { nombre: p.nombre, orden: String(p.orden), planSlaId: p.planSlaId ?? "" };
}

/** Selector de Plan SLA: mismas opciones para la fila nueva y la edición inline. */
function SelectorPlanSla({
  value,
  onChange,
  planes,
}: {
  value: string;
  onChange: (v: string) => void;
  planes: { id: string; nombre: string }[];
}) {
  return (
    <Select value={value || SIN_PLAN} onValueChange={(v) => onChange(v === SIN_PLAN ? "" : v)}>
      <SelectTrigger className="h-9 w-40 text-sm">
        <span>{value ? (planes.find((pl) => pl.id === value)?.nombre ?? "—") : "Sin SLA"}</span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={SIN_PLAN}>Sin SLA</SelectItem>
        {planes.map((pl) => (
          <SelectItem key={pl.id} value={pl.id}>
            {pl.nombre}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function FilaPrioridad({
  prioridad,
  puedeEscribir,
  planes,
}: {
  prioridad: Prioridad;
  puedeEscribir: boolean;
  planes: { id: string; nombre: string }[];
}) {
  const actualizar = useActualizarPrioridad();
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState<Borrador>(() => aBorrador(prioridad));

  const iniciarEdicion = () => {
    setBorrador(aBorrador(prioridad));
    setEditando(true);
  };

  const guardar = () => {
    if (!borrador.nombre.trim()) return;
    actualizar.mutate(
      {
        id: prioridad.id,
        datos: {
          nombre: borrador.nombre.trim(),
          orden: Math.round(Number(borrador.orden) || 0),
          planSlaId: borrador.planSlaId || null,
        },
      },
      { onSuccess: () => setEditando(false) },
    );
  };

  return (
    <tr className="border-b border-border/70 last:border-0">
      {editando ? (
        <>
          <td className="px-4 py-3">
            <Input value={borrador.nombre} onChange={(e) => setBorrador((b) => ({ ...b, nombre: e.target.value }))} className="h-9 w-32" />
          </td>
          <td className="px-4 py-3">
            <Input
              type="number"
              step={1}
              value={borrador.orden}
              onChange={(e) => setBorrador((b) => ({ ...b, orden: e.target.value }))}
              className="h-9 w-20"
            />
          </td>
          <td className="px-4 py-3">
            <SelectorPlanSla value={borrador.planSlaId} onChange={(v) => setBorrador((b) => ({ ...b, planSlaId: v }))} planes={planes} />
          </td>
        </>
      ) : (
        <>
          <td className="px-4 py-3">{prioridad.nombre}</td>
          <td className="px-4 py-3 font-mono text-xs">{prioridad.orden}</td>
          <td className="px-4 py-3 text-muted-foreground">
            {prioridad.planSlaId ? (planes.find((pl) => pl.id === prioridad.planSlaId)?.nombre ?? "—") : "Sin SLA"}
          </td>
        </>
      )}
      <td className="px-4 py-3">
        <Switch
          checked={prioridad.activo}
          disabled={!puedeEscribir || actualizar.isPending}
          onCheckedChange={(v) => actualizar.mutate({ id: prioridad.id, datos: { activo: v } })}
          aria-label={`Activo prioridad ${prioridad.nombre}`}
        />
      </td>
      {puedeEscribir && (
        <td className="px-4 py-3 text-right">
          {editando ? (
            <div className="flex items-center justify-end gap-1">
              <Button size="sm" className="h-8 text-xs" disabled={actualizar.isPending} onClick={guardar}>
                Guardar
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground"
                onClick={() => setEditando(false)}
                aria-label="Cancelar edición"
              >
                <X className="size-4" />
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-foreground"
              onClick={iniciarEdicion}
              aria-label={`Editar prioridad ${prioridad.nombre}`}
            >
              <Pencil className="size-4" />
            </Button>
          )}
        </td>
      )}
    </tr>
  );
}

export function SeccionPrioridades({ puedeEscribir }: { puedeEscribir: boolean }) {
  const { data: prioridades, isLoading, isError } = usePrioridades();
  const { data: planes } = usePlanesSla();
  const crear = useCrearPrioridad();

  const [nombre, setNombre] = useState("");
  const [orden, setOrden] = useState("0");
  const [planSlaId, setPlanSlaId] = useState("");

  const agregar = () => {
    if (!nombre.trim()) return;
    crear.mutate(
      { nombre: nombre.trim(), orden: Math.round(Number(orden) || 0), planSlaId: planSlaId || null },
      {
        onSuccess: () => {
          setNombre("");
          setOrden("0");
          setPlanSlaId("");
        },
      },
    );
  };

  const planesOpciones = planes ?? [];

  return (
    <div className="mt-4">
      {!puedeEscribir && (
        <p className="mb-3 flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          <ShieldAlert className="size-4 shrink-0" />
          Solo un administrador puede crear o editar prioridades. Estás viendo el catálogo actual de solo
          lectura.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-card card-elev">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Nombre</th>
              <th className="px-4 py-2.5 font-medium">Orden</th>
              <th className="px-4 py-2.5 font-medium">Plan SLA</th>
              <th className="px-4 py-2.5 font-medium">Activo</th>
              {puedeEscribir && <th className="px-4 py-2.5 font-medium" />}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className="px-4 py-3 text-muted-foreground" colSpan={5}>
                  Cargando prioridades…
                </td>
              </tr>
            )}
            {isError && (
              <tr>
                <td className="px-4 py-3 text-alta" colSpan={5}>
                  No se pudieron cargar las prioridades.
                </td>
              </tr>
            )}
            {prioridades?.length === 0 && (
              <tr>
                <td className="px-4 py-3 text-muted-foreground" colSpan={5}>
                  Sin prioridades registradas.
                </td>
              </tr>
            )}
            {prioridades?.map((p) => (
              <FilaPrioridad key={p.id} prioridad={p} puedeEscribir={puedeEscribir} planes={planesOpciones} />
            ))}
          </tbody>
        </table>
      </div>

      {puedeEscribir && (
        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card card-elev p-3">
          <div className="min-w-40 flex-1 space-y-1.5">
            <Label htmlFor="prioridad-nombre" className="text-xs">
              Nombre
            </Label>
            <Input id="prioridad-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Urgente" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prioridad-orden" className="text-xs">
              Orden
            </Label>
            <Input id="prioridad-orden" type="number" step={1} value={orden} onChange={(e) => setOrden(e.target.value)} className="h-9 w-20" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Plan SLA</Label>
            <SelectorPlanSla value={planSlaId} onChange={setPlanSlaId} planes={planesOpciones} />
          </div>
          <Button className="h-9" onClick={agregar} disabled={crear.isPending || !nombre.trim()}>
            Agregar prioridad
          </Button>
        </div>
      )}
    </div>
  );
}
