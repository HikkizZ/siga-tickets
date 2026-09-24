// Sección "Estados de ticket" de /configuracion (Fase C, docs/api.md): catálogo con 6 flags de
// comportamiento (ver backend/src/entities/EstadoTicket.ts para el detalle de cada uno). Tabla +
// un formulario compartido para crear/editar (un estado a la vez), mismo criterio que
// SeccionTemasAyuda.tsx — con 6 checkboxes por fila, la edición inline de SeccionPlanesSla.tsx no
// entraba cómoda en una tabla.
//
// El backend puede rechazar un guardado con 400 ESTADO_TICKET_SIN_REEMPLAZO si deja el catálogo
// sin ninguna fila `esEstadoInicial` o sin ninguna `esDestinoReapertura` (docs/api.md) — el mensaje
// ya es legible, así que el toast.error genérico de useActualizarEstadoTicket alcanza, sin manejo
// especial acá.
import { useState } from "react";
import { Pencil, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useActualizarEstadoTicket, useCrearEstadoTicket, useEstadosTicket } from "@/hooks/useEstadosTicket";
import type { EstadoTicket } from "@/lib/api/estadosTicket";

type FlagKey = "esEstadoInicial" | "esDestinoReapertura" | "esPausaSla" | "marcaResueltoEn" | "marcaCerradoEn" | "esTerminal";

// `title` da el texto llano al pasar el mouse: el nombre corto solo no le dice nada a un admin sin
// contexto del proyecto (pidió explícitamente evitar mostrar los nombres técnicos tal cual).
const FLAGS: { key: FlagKey; label: string; ayuda: string }[] = [
  { key: "esEstadoInicial", label: "Estado inicial", ayuda: "Los tickets nuevos empiezan en este estado (debe haber exactamente uno)." },
  { key: "esDestinoReapertura", label: "Destino al reabrir", ayuda: "A este estado vuelve un ticket cuando se reabre (debe haber exactamente uno)." },
  { key: "esPausaSla", label: "Pausa SLA", ayuda: "Mientras un ticket está en este estado, se pausa el conteo del plazo de SLA." },
  { key: "marcaResueltoEn", label: "Marca resuelto", ayuda: "La primera vez que un ticket entra aquí, se registra su fecha de resolución." },
  { key: "marcaCerradoEn", label: "Marca cerrado", ayuda: "La primera vez que un ticket entra aquí, se registra su fecha de cierre." },
  { key: "esTerminal", label: "Terminal", ayuda: "Los tickets en este estado ya no se consideran abiertos (se excluyen del SLA)." },
];

type Formulario = { nombre: string; orden: string } & Record<FlagKey, boolean>;

const FORM_VACIO: Formulario = {
  nombre: "",
  orden: "0",
  esEstadoInicial: false,
  esDestinoReapertura: false,
  esPausaSla: false,
  marcaResueltoEn: false,
  marcaCerradoEn: false,
  esTerminal: false,
};

function aFormulario(e: EstadoTicket): Formulario {
  return {
    nombre: e.nombre,
    orden: String(e.orden),
    esEstadoInicial: e.esEstadoInicial,
    esDestinoReapertura: e.esDestinoReapertura,
    esPausaSla: e.esPausaSla,
    marcaResueltoEn: e.marcaResueltoEn,
    marcaCerradoEn: e.marcaCerradoEn,
    esTerminal: e.esTerminal,
  };
}

export function SeccionEstadosTicket({ puedeEscribir }: { puedeEscribir: boolean }) {
  const { data: estados, isLoading, isError } = useEstadosTicket();
  const crear = useCrearEstadoTicket();
  const actualizar = useActualizarEstadoTicket();

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<Formulario>(FORM_VACIO);

  const editar = (estado: EstadoTicket) => {
    setEditandoId(estado.id);
    setForm(aFormulario(estado));
  };

  const cancelar = () => {
    setEditandoId(null);
    setForm(FORM_VACIO);
  };

  const guardar = () => {
    if (!form.nombre.trim()) return;
    const orden = Number.isFinite(Number(form.orden)) ? Math.round(Number(form.orden)) : 0;
    const flags = Object.fromEntries(FLAGS.map((f) => [f.key, form[f.key]])) as Record<FlagKey, boolean>;
    if (editandoId) {
      actualizar.mutate({ id: editandoId, datos: { nombre: form.nombre.trim(), orden, ...flags } }, { onSuccess: cancelar });
    } else {
      crear.mutate({ nombre: form.nombre.trim(), orden, ...flags }, { onSuccess: cancelar });
    }
  };

  const guardando = crear.isPending || actualizar.isPending;

  return (
    <div className="mt-4">
      {!puedeEscribir && (
        <p className="mb-3 flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          <ShieldAlert className="size-4 shrink-0" />
          Solo un administrador puede crear o editar estados de ticket. Estás viendo el catálogo actual de solo
          lectura.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-card card-elev">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Nombre</th>
              <th className="px-4 py-2.5 font-medium">Orden</th>
              <th className="px-4 py-2.5 font-medium">Comportamiento</th>
              <th className="px-4 py-2.5 font-medium">Activo</th>
              {puedeEscribir && <th className="px-4 py-2.5 font-medium" />}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className="px-4 py-3 text-muted-foreground" colSpan={5}>
                  Cargando estados de ticket…
                </td>
              </tr>
            )}
            {isError && (
              <tr>
                <td className="px-4 py-3 text-alta" colSpan={5}>
                  No se pudieron cargar los estados de ticket.
                </td>
              </tr>
            )}
            {estados?.length === 0 && (
              <tr>
                <td className="px-4 py-3 text-muted-foreground" colSpan={5}>
                  Sin estados de ticket registrados.
                </td>
              </tr>
            )}
            {estados?.map((e) => {
              const flagsActivos = FLAGS.filter((f) => e[f.key]);
              return (
                <tr key={e.id} className="border-b border-border/70 last:border-0">
                  <td className="px-4 py-3">{e.nombre}</td>
                  <td className="px-4 py-3 font-mono text-xs">{e.orden}</td>
                  <td className="px-4 py-3">
                    {flagsActivos.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {flagsActivos.map((f) => (
                          <span
                            key={f.key}
                            title={f.ayuda}
                            className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {f.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Switch
                      checked={e.activo}
                      disabled={!puedeEscribir || actualizar.isPending}
                      onCheckedChange={(v) => actualizar.mutate({ id: e.id, datos: { activo: v } })}
                      aria-label={`Activo estado ${e.nombre}`}
                    />
                  </td>
                  {puedeEscribir && (
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-foreground"
                        onClick={() => editar(e)}
                        aria-label={`Editar estado ${e.nombre}`}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {puedeEscribir && (
        <div className="mt-3 space-y-3 rounded-xl border border-border bg-card card-elev p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {editandoId ? "Editar estado de ticket" : "Nuevo estado de ticket"}
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
                placeholder="En espera de repuesto"
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
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {FLAGS.map((f) => (
              <label key={f.key} title={f.ayuda} className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={form[f.key]}
                  onCheckedChange={(v) => setForm((prev) => ({ ...prev, [f.key]: v === true }))}
                />
                {f.label}
              </label>
            ))}
          </div>
          <div>
            <Button className="h-9" onClick={guardar} disabled={guardando || !form.nombre.trim()}>
              {guardando ? "Guardando…" : editandoId ? "Guardar cambios" : "Crear estado de ticket"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
