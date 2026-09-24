// Sección "Fuentes de ticket" de /configuracion (Fase C, docs/api.md): catálogo CanalTicket,
// mostrado al admin como "Fuentes" aunque el campo interno del Ticket siga llamándose `canal`
// (mismo criterio que src/lib/api/fuentesTicket.ts). Tabla + formulario compartido para
// crear/editar, mismo estilo que SeccionTemasAyuda.tsx.
import { useState } from "react";
import { Pencil, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useActualizarFuenteTicket, useCrearFuenteTicket, useFuentesTicket } from "@/hooks/useFuentesTicket";
import { ORIGENES_OT, etiquetaOrigenOt, type OrigenOt } from "@/lib/labels";
import type { FuenteTicket } from "@/lib/api/fuentesTicket";

type Formulario = { nombre: string; orden: string; esManual: boolean; origenOtEquivalente: OrigenOt };

const FORM_VACIO: Formulario = { nombre: "", orden: "0", esManual: true, origenOtEquivalente: "correo" };

function aFormulario(f: FuenteTicket): Formulario {
  return { nombre: f.nombre, orden: String(f.orden), esManual: f.esManual, origenOtEquivalente: f.origenOtEquivalente };
}

export function SeccionFuentesTicket({ puedeEscribir }: { puedeEscribir: boolean }) {
  const { data: fuentes, isLoading, isError } = useFuentesTicket();
  const crear = useCrearFuenteTicket();
  const actualizar = useActualizarFuenteTicket();

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<Formulario>(FORM_VACIO);

  const editar = (fuente: FuenteTicket) => {
    setEditandoId(fuente.id);
    setForm(aFormulario(fuente));
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
          datos: { nombre: form.nombre.trim(), orden, esManual: form.esManual, origenOtEquivalente: form.origenOtEquivalente },
        },
        { onSuccess: cancelar },
      );
    } else {
      crear.mutate(
        { nombre: form.nombre.trim(), orden, esManual: form.esManual, origenOtEquivalente: form.origenOtEquivalente },
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
          Solo un administrador puede crear o editar fuentes de ticket. Estás viendo el catálogo actual de solo
          lectura.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-card card-elev">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Nombre</th>
              <th className="px-4 py-2.5 font-medium">Orden</th>
              <th className="px-4 py-2.5 font-medium">Manual</th>
              <th className="px-4 py-2.5 font-medium">Origen de OT equivalente</th>
              <th className="px-4 py-2.5 font-medium">Activo</th>
              {puedeEscribir && <th className="px-4 py-2.5 font-medium" />}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className="px-4 py-3 text-muted-foreground" colSpan={6}>
                  Cargando fuentes de ticket…
                </td>
              </tr>
            )}
            {isError && (
              <tr>
                <td className="px-4 py-3 text-alta" colSpan={6}>
                  No se pudieron cargar las fuentes de ticket.
                </td>
              </tr>
            )}
            {fuentes?.length === 0 && (
              <tr>
                <td className="px-4 py-3 text-muted-foreground" colSpan={6}>
                  Sin fuentes de ticket registradas.
                </td>
              </tr>
            )}
            {fuentes?.map((f) => (
              <tr key={f.id} className="border-b border-border/70 last:border-0">
                <td className="px-4 py-3">{f.nombre}</td>
                <td className="px-4 py-3 font-mono text-xs">{f.orden}</td>
                <td className="px-4 py-3 text-muted-foreground">{f.esManual ? "Sí" : "No"}</td>
                <td className="px-4 py-3 text-muted-foreground">{etiquetaOrigenOt(f.origenOtEquivalente)}</td>
                <td className="px-4 py-3">
                  <Switch
                    checked={f.activo}
                    disabled={!puedeEscribir || actualizar.isPending}
                    onCheckedChange={(v) => actualizar.mutate({ id: f.id, datos: { activo: v } })}
                    aria-label={`Activo fuente ${f.nombre}`}
                  />
                </td>
                {puedeEscribir && (
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-foreground"
                      onClick={() => editar(f)}
                      aria-label={`Editar fuente ${f.nombre}`}
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
              {editandoId ? "Editar fuente de ticket" : "Nueva fuente de ticket"}
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
                placeholder="WhatsApp"
                className="h-9"
              />
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
            <div className="space-y-1.5">
              <Label className="text-xs">Origen de OT equivalente</Label>
              <Select
                value={form.origenOtEquivalente}
                onValueChange={(v) => setForm((prev) => ({ ...prev, origenOtEquivalente: v as OrigenOt }))}
              >
                <SelectTrigger className="h-9 text-sm">
                  <span>{etiquetaOrigenOt(form.origenOtEquivalente)}</span>
                </SelectTrigger>
                <SelectContent>
                  {ORIGENES_OT.map((o) => (
                    <SelectItem key={o} value={o}>
                      {etiquetaOrigenOt(o)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2 pb-0.5">
              <Checkbox
                id="fuente-manual"
                checked={form.esManual}
                onCheckedChange={(v) => setForm((prev) => ({ ...prev, esManual: v === true }))}
              />
              <Label htmlFor="fuente-manual" className="text-xs font-normal">
                Elegible al crear un ticket a mano
              </Label>
            </div>
          </div>
          <div>
            <Button className="h-9" onClick={guardar} disabled={guardando || !form.nombre.trim()}>
              {guardando ? "Guardando…" : editandoId ? "Guardar cambios" : "Crear fuente de ticket"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
