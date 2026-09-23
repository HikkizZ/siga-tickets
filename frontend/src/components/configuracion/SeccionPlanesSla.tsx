// Sección "Planes SLA" de /configuracion (Fase B2, docs/api.md). Mismos 5 campos de configuración
// que la tabla de SLA por prioridad (src/routes/configuracion.tsx), pero con nombre propio y
// varias filas (no 3 fijas). A diferencia de Departamentos/Temas de ayuda, acá SÍ hay borrado por
// fila (con confirmación simple vía `window.confirm` — no había ningún patrón de confirmación ya
// establecido en el proyecto para reutilizar, así que se optó por el más simple).
import { useState } from "react";
import { Pencil, ShieldAlert, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  useActualizarPlanSla,
  useCrearPlanSla,
  useEliminarPlanSla,
  usePlanesSla,
} from "@/hooks/usePlanesSla";
import type { PlanSla } from "@/lib/api/planesSla";

type BorradorPlan = {
  nombre: string;
  horasResolucion: string;
  horasPrimeraRespuesta: string;
  usarHorasHabiles: boolean;
  pausarEnEsperaCliente: boolean;
  umbralPorVencer: string;
};

const BORRADOR_VACIO: BorradorPlan = {
  nombre: "",
  horasResolucion: "4",
  horasPrimeraRespuesta: "1",
  usarHorasHabiles: true,
  pausarEnEsperaCliente: true,
  umbralPorVencer: "0.2",
};

function aBorrador(plan: PlanSla): BorradorPlan {
  return {
    nombre: plan.nombre,
    horasResolucion: String(plan.horasResolucion),
    horasPrimeraRespuesta: String(plan.horasPrimeraRespuesta),
    usarHorasHabiles: plan.usarHorasHabiles,
    pausarEnEsperaCliente: plan.pausarEnEsperaCliente,
    umbralPorVencer: String(plan.umbralPorVencer),
  };
}

/** Campos de un plan (nombre + los mismos 5 de sla_config): Input/Switch editables o texto plano
 * de solo lectura, mismo criterio que la tabla de SLA por prioridad. */
function CamposPlan({
  borrador,
  onChange,
  soloLectura,
}: {
  borrador: BorradorPlan;
  onChange: <K extends keyof BorradorPlan>(campo: K, valor: BorradorPlan[K]) => void;
  soloLectura?: boolean;
}) {
  if (soloLectura) {
    return (
      <>
        <td className="px-4 py-3">{borrador.nombre}</td>
        <td className="px-4 py-3 font-mono">{borrador.horasResolucion}</td>
        <td className="px-4 py-3 font-mono">{borrador.horasPrimeraRespuesta}</td>
        <td className="px-4 py-3">{borrador.usarHorasHabiles ? "Sí" : "No"}</td>
        <td className="px-4 py-3">{borrador.pausarEnEsperaCliente ? "Sí" : "No"}</td>
        <td className="px-4 py-3 font-mono">{Math.round(Number(borrador.umbralPorVencer) * 100)}%</td>
      </>
    );
  }
  return (
    <>
      <td className="px-4 py-3">
        <Input value={borrador.nombre} onChange={(e) => onChange("nombre", e.target.value)} className="h-9 w-40" />
      </td>
      <td className="px-4 py-3">
        <Input
          type="number"
          min={1}
          step={1}
          value={borrador.horasResolucion}
          onChange={(e) => onChange("horasResolucion", e.target.value)}
          className="h-9 w-20"
        />
      </td>
      <td className="px-4 py-3">
        <Input
          type="number"
          min={1}
          step={1}
          value={borrador.horasPrimeraRespuesta}
          onChange={(e) => onChange("horasPrimeraRespuesta", e.target.value)}
          className="h-9 w-20"
        />
      </td>
      <td className="px-4 py-3">
        <Switch checked={borrador.usarHorasHabiles} onCheckedChange={(v) => onChange("usarHorasHabiles", v)} />
      </td>
      <td className="px-4 py-3">
        <Switch checked={borrador.pausarEnEsperaCliente} onCheckedChange={(v) => onChange("pausarEnEsperaCliente", v)} />
      </td>
      <td className="px-4 py-3">
        <Input
          type="number"
          min={0.01}
          max={1}
          step={0.05}
          value={borrador.umbralPorVencer}
          onChange={(e) => onChange("umbralPorVencer", e.target.value)}
          className="h-9 w-20"
        />
      </td>
    </>
  );
}

/** Una fila de plan: solo lectura, con Editar/Eliminar, o inline-editable si `editando`. El
 * "Activo" queda siempre como un toggle directo (no exige entrar en edición), mismo criterio que
 * Departamentos/Temas de ayuda. */
function FilaPlan({ plan, puedeEscribir }: { plan: PlanSla; puedeEscribir: boolean }) {
  const actualizar = useActualizarPlanSla();
  const eliminar = useEliminarPlanSla();
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState<BorradorPlan>(() => aBorrador(plan));

  const actualizarCampo = <K extends keyof BorradorPlan>(campo: K, valor: BorradorPlan[K]) =>
    setBorrador((prev) => ({ ...prev, [campo]: valor }));

  const iniciarEdicion = () => {
    setBorrador(aBorrador(plan));
    setEditando(true);
  };

  const guardar = () => {
    if (!borrador.nombre.trim()) return;
    actualizar.mutate(
      {
        id: plan.id,
        datos: {
          nombre: borrador.nombre.trim(),
          horasResolucion: Math.max(1, Math.round(Number(borrador.horasResolucion) || 1)),
          horasPrimeraRespuesta: Math.max(1, Math.round(Number(borrador.horasPrimeraRespuesta) || 1)),
          usarHorasHabiles: borrador.usarHorasHabiles,
          pausarEnEsperaCliente: borrador.pausarEnEsperaCliente,
          umbralPorVencer: Math.min(1, Math.max(0.01, Number(borrador.umbralPorVencer) || 0.01)),
        },
      },
      { onSuccess: () => setEditando(false) },
    );
  };

  const confirmarEliminar = () => {
    if (window.confirm(`¿Eliminar el plan SLA "${plan.nombre}"? Esta acción no se puede deshacer.`)) {
      eliminar.mutate(plan.id);
    }
  };

  return (
    <tr className="border-b border-border/70 last:border-0">
      <CamposPlan borrador={editando ? borrador : aBorrador(plan)} onChange={actualizarCampo} soloLectura={!editando} />
      <td className="px-4 py-3">
        <Switch
          checked={plan.activo}
          disabled={!puedeEscribir || actualizar.isPending}
          onCheckedChange={(v) => actualizar.mutate({ id: plan.id, datos: { activo: v } })}
          aria-label={`Activo plan ${plan.nombre}`}
        />
      </td>
      {puedeEscribir && (
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-1">
            {editando ? (
              <>
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
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-foreground"
                  onClick={iniciarEdicion}
                  aria-label={`Editar plan ${plan.nombre}`}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-alta"
                  disabled={eliminar.isPending}
                  onClick={confirmarEliminar}
                  aria-label={`Eliminar plan ${plan.nombre}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </>
            )}
          </div>
        </td>
      )}
    </tr>
  );
}

export function SeccionPlanesSla({ puedeEscribir }: { puedeEscribir: boolean }) {
  const { data: planes, isLoading, isError } = usePlanesSla();
  const crear = useCrearPlanSla();
  const [nuevo, setNuevo] = useState<BorradorPlan>(BORRADOR_VACIO);

  const actualizarNuevo = <K extends keyof BorradorPlan>(campo: K, valor: BorradorPlan[K]) =>
    setNuevo((prev) => ({ ...prev, [campo]: valor }));

  const agregar = () => {
    if (!nuevo.nombre.trim()) return;
    crear.mutate(
      {
        nombre: nuevo.nombre.trim(),
        horasResolucion: Math.max(1, Math.round(Number(nuevo.horasResolucion) || 1)),
        horasPrimeraRespuesta: Math.max(1, Math.round(Number(nuevo.horasPrimeraRespuesta) || 1)),
        usarHorasHabiles: nuevo.usarHorasHabiles,
        pausarEnEsperaCliente: nuevo.pausarEnEsperaCliente,
        umbralPorVencer: Math.min(1, Math.max(0.01, Number(nuevo.umbralPorVencer) || 0.01)),
      },
      { onSuccess: () => setNuevo(BORRADOR_VACIO) },
    );
  };

  return (
    <div className="mt-4">
      {!puedeEscribir && (
        <p className="mb-3 flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          <ShieldAlert className="size-4 shrink-0" />
          Solo un administrador puede crear, editar o eliminar planes SLA. Estás viendo el catálogo actual de solo
          lectura.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-card card-elev">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Nombre</th>
              <th className="px-4 py-2.5 font-medium">Resolución (h)</th>
              <th className="px-4 py-2.5 font-medium">Primera respuesta (h)</th>
              <th className="px-4 py-2.5 font-medium">Horas hábiles</th>
              <th className="px-4 py-2.5 font-medium">Pausa en espera cliente</th>
              <th className="px-4 py-2.5 font-medium">Umbral "por vencer"</th>
              <th className="px-4 py-2.5 font-medium">Activo</th>
              {puedeEscribir && <th className="px-4 py-2.5 font-medium" />}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className="px-4 py-3 text-muted-foreground" colSpan={8}>
                  Cargando planes SLA…
                </td>
              </tr>
            )}
            {isError && (
              <tr>
                <td className="px-4 py-3 text-alta" colSpan={8}>
                  No se pudieron cargar los planes SLA.
                </td>
              </tr>
            )}
            {planes?.length === 0 && (
              <tr>
                <td className="px-4 py-3 text-muted-foreground" colSpan={8}>
                  Sin planes SLA registrados.
                </td>
              </tr>
            )}
            {planes?.map((p) => (
              <FilaPlan key={p.id} plan={p} puedeEscribir={puedeEscribir} />
            ))}
          </tbody>
        </table>
      </div>

      {puedeEscribir && (
        <div className="mt-3 space-y-3 rounded-xl border border-border bg-card card-elev p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nuevo plan SLA</h3>
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-1 font-medium">Nombre</th>
                <th className="px-4 py-1 font-medium">Resolución (h)</th>
                <th className="px-4 py-1 font-medium">1ra respuesta (h)</th>
                <th className="px-4 py-1 font-medium">Horas hábiles</th>
                <th className="px-4 py-1 font-medium">Pausa espera cliente</th>
                <th className="px-4 py-1 font-medium">Umbral</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <CamposPlan borrador={nuevo} onChange={actualizarNuevo} />
              </tr>
            </tbody>
          </table>
          <Button className="h-9" onClick={agregar} disabled={crear.isPending || !nuevo.nombre.trim()}>
            Crear plan SLA
          </Button>
        </div>
      )}
    </div>
  );
}
