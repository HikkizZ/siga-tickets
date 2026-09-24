// Sección "Temas de ayuda" de /configuracion (Fase B1, docs/api.md). Tabla (nombre, departamento
// sugerido, prioridad sugerida, público/interno, orden, activo) + un formulario compartido para
// crear/editar (un solo tema a la vez), mismo estilo visual que el resto del archivo.
import { useState } from "react";
import { Pencil, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useDepartamentos } from "@/hooks/useDepartamentos";
import { useActualizarTemaAyuda, useCrearTemaAyuda, useTemasAyuda } from "@/hooks/useTemasAyuda";
import { usePrioridades } from "@/hooks/usePrioridades";
import type { TemaAyuda } from "@/lib/api/temasAyuda";

// Sentinel para "sin departamento" / "sin prioridad sugerida" en los <Select> (Radix no admite
// value="" en SelectItem) — mismo criterio que el sentinel TODOS de src/routes/tickets.tsx.
const SIN_DEPARTAMENTO = "__sin_departamento__";
const SIN_PRIORIDAD = "__sin_prioridad__";

type FormularioTema = {
  nombre: string;
  departamentoId: string;
  // Fase C: prioridadSugerida pasó de valor de enum a uuid de una fila del catálogo Prioridad.
  prioridadSugeridaId: string;
  esPublico: boolean;
  orden: string;
};

const FORM_VACIO: FormularioTema = { nombre: "", departamentoId: "", prioridadSugeridaId: "", esPublico: true, orden: "0" };

function aFormulario(tema: TemaAyuda): FormularioTema {
  return {
    nombre: tema.nombre,
    departamentoId: tema.departamento?.id ?? "",
    prioridadSugeridaId: tema.prioridadSugerida?.id ?? "",
    esPublico: tema.esPublico,
    orden: String(tema.orden),
  };
}

export function SeccionTemasAyuda({ puedeEscribir }: { puedeEscribir: boolean }) {
  const { data: temas, isLoading, isError } = useTemasAyuda();
  const { data: departamentos } = useDepartamentos();
  const { data: prioridades } = usePrioridades();
  const crear = useCrearTemaAyuda();
  const actualizar = useActualizarTemaAyuda();

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<FormularioTema>(FORM_VACIO);

  const editar = (tema: TemaAyuda) => {
    setEditandoId(tema.id);
    setForm(aFormulario(tema));
  };

  const cancelar = () => {
    setEditandoId(null);
    setForm(FORM_VACIO);
  };

  const guardar = () => {
    if (!form.nombre.trim()) return;
    const orden = Number.isFinite(Number(form.orden)) ? Math.round(Number(form.orden)) : 0;
    if (editandoId) {
      actualizar.mutate(
        {
          id: editandoId,
          datos: {
            nombre: form.nombre.trim(),
            esPublico: form.esPublico,
            orden,
            departamentoId: form.departamentoId || null,
            prioridadSugeridaId: form.prioridadSugeridaId || null,
          },
        },
        { onSuccess: cancelar },
      );
    } else {
      crear.mutate(
        {
          nombre: form.nombre.trim(),
          esPublico: form.esPublico,
          orden,
          ...(form.departamentoId ? { departamentoId: form.departamentoId } : {}),
          ...(form.prioridadSugeridaId ? { prioridadSugeridaId: form.prioridadSugeridaId } : {}),
        },
        { onSuccess: cancelar },
      );
    }
  };

  const guardando = crear.isPending || actualizar.isPending;

  return (
    <div className="mt-4">
      {!puedeEscribir && (
        <p className="mb-3 flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          <ShieldAlert className="size-4 shrink-0" />
          Solo un administrador puede crear o editar temas de ayuda. Estás viendo el catálogo actual de solo
          lectura.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-card card-elev">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Nombre</th>
              <th className="px-4 py-2.5 font-medium">Departamento sugerido</th>
              <th className="px-4 py-2.5 font-medium">Prioridad sugerida</th>
              <th className="px-4 py-2.5 font-medium">Público</th>
              <th className="px-4 py-2.5 font-medium">Orden</th>
              <th className="px-4 py-2.5 font-medium">Activo</th>
              {puedeEscribir && <th className="px-4 py-2.5 font-medium" />}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className="px-4 py-3 text-muted-foreground" colSpan={7}>
                  Cargando temas de ayuda…
                </td>
              </tr>
            )}
            {isError && (
              <tr>
                <td className="px-4 py-3 text-alta" colSpan={7}>
                  No se pudieron cargar los temas de ayuda.
                </td>
              </tr>
            )}
            {temas?.length === 0 && (
              <tr>
                <td className="px-4 py-3 text-muted-foreground" colSpan={7}>
                  Sin temas de ayuda registrados.
                </td>
              </tr>
            )}
            {temas?.map((t) => (
              <tr key={t.id} className="border-b border-border/70 last:border-0">
                <td className="px-4 py-3">{t.nombre}</td>
                <td className="px-4 py-3 text-muted-foreground">{t.departamento?.nombre ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{t.prioridadSugerida?.nombre ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{t.esPublico ? "Sí" : "Interno"}</td>
                <td className="px-4 py-3 font-mono text-xs">{t.orden}</td>
                <td className="px-4 py-3">
                  <Switch
                    checked={t.activo}
                    disabled={!puedeEscribir || actualizar.isPending}
                    onCheckedChange={(v) => actualizar.mutate({ id: t.id, datos: { activo: v } })}
                    aria-label={`Activo tema ${t.nombre}`}
                  />
                </td>
                {puedeEscribir && (
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-foreground"
                      onClick={() => editar(t)}
                      aria-label={`Editar tema ${t.nombre}`}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {puedeEscribir && (
        <div className="mt-3 space-y-3 rounded-xl border border-border bg-card card-elev p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {editandoId ? "Editar tema de ayuda" : "Nuevo tema de ayuda"}
            </h3>
            {editandoId && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={cancelar}>
                <X className="size-3.5" /> Cancelar edición
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Nombre</Label>
              <Input
                value={form.nombre}
                onChange={(e) => setForm((prev) => ({ ...prev, nombre: e.target.value }))}
                placeholder="Falla de hardware"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Departamento sugerido</Label>
              <Select
                value={form.departamentoId || SIN_DEPARTAMENTO}
                onValueChange={(v) => setForm((prev) => ({ ...prev, departamentoId: v === SIN_DEPARTAMENTO ? "" : v }))}
              >
                <SelectTrigger className="h-9 text-sm">
                  <span>
                    {form.departamentoId
                      ? (departamentos ?? []).find((d) => d.id === form.departamentoId)?.nombre ?? "—"
                      : "Sin departamento"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_DEPARTAMENTO}>Sin departamento</SelectItem>
                  {(departamentos ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Prioridad sugerida</Label>
              <Select
                value={form.prioridadSugeridaId || SIN_PRIORIDAD}
                onValueChange={(v) =>
                  setForm((prev) => ({ ...prev, prioridadSugeridaId: v === SIN_PRIORIDAD ? "" : v }))
                }
              >
                <SelectTrigger className="h-9 text-sm">
                  <span>
                    {form.prioridadSugeridaId
                      ? (prioridades ?? []).find((p) => p.id === form.prioridadSugeridaId)?.nombre ?? "—"
                      : "Sin sugerencia"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_PRIORIDAD}>Sin sugerencia</SelectItem>
                  {(prioridades ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Orden</Label>
              <Input
                type="number"
                step={1}
                value={form.orden}
                onChange={(e) => setForm((prev) => ({ ...prev, orden: e.target.value }))}
                className="h-9"
              />
            </div>
            <div className="flex items-end gap-2 pb-0.5">
              <Checkbox
                id="tema-publico"
                checked={form.esPublico}
                onCheckedChange={(v) => setForm((prev) => ({ ...prev, esPublico: v === true }))}
              />
              <Label htmlFor="tema-publico" className="text-xs font-normal">
                Público (visible en el portal)
              </Label>
            </div>
          </div>
          <div>
            <Button className="h-9" onClick={guardar} disabled={guardando || !form.nombre.trim()}>
              {guardando ? "Guardando…" : editandoId ? "Guardar cambios" : "Crear tema de ayuda"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
