import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PrioridadBadge } from "@/components/Prioridad";
import {
  slaPorDefecto,
  slaRespuestaPorDefecto,
  type Prioridad,
  type SlaConfig,
  type SlaRespuestaConfig,
} from "@/lib/mock-data";
import { useOTStore } from "@/lib/ot-store";

export const Route = createFileRoute("/configuracion")({
  head: () => ({
    meta: [
      { title: "Configuración de SLA · Taller OT" },
      {
        name: "description",
        content:
          "Define las horas de plazo de resolución y de primera respuesta por prioridad para órdenes de trabajo y tickets de la mesa de ayuda.",
      },
      { property: "og:title", content: "Configuración de SLA · Taller OT" },
      {
        property: "og:description",
        content: "Ajusta el SLA de resolución y de primera respuesta para prioridad Alta, Media y Baja.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Configuracion,
});

const prioridades: Prioridad[] = ["Alta", "Media", "Baja"];

function Configuracion() {
  const { sla, slaRespuesta, guardarSla, guardarSlaRespuesta } = useOTStore();
  const [borrador, setBorrador] = useState<SlaConfig>(sla);
  const [borradorRespuesta, setBorradorRespuesta] = useState<SlaRespuestaConfig>(slaRespuesta);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    if (!guardado) return;
    const t = setTimeout(() => setGuardado(false), 2500);
    return () => clearTimeout(t);
  }, [guardado]);

  return (
    <div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Settings className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Configuración de SLA</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Horas de plazo por prioridad: resolución de la OT y primera respuesta de los tickets.
          </p>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-card card-elev">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Prioridad</th>
              <th className="px-4 py-2.5 font-medium">Resolución (horas)</th>
              <th className="px-4 py-2.5 font-medium">Primera respuesta (horas)</th>
              <th className="px-4 py-2.5 font-medium">Por defecto</th>
            </tr>
          </thead>
          <tbody>
            {prioridades.map((p) => (
              <tr key={p} className="border-b border-border/70 last:border-0">
                <td className="px-4 py-3">
                  <PrioridadBadge prioridad={p} />
                </td>
                <td className="px-4 py-3">
                  <Input
                    type="number"
                    min={1}
                    value={borrador[p]}
                    onChange={(e) =>
                      setBorrador((b) => ({ ...b, [p]: Math.max(1, Number(e.target.value) || 1) }))
                    }
                    className="h-9 w-28"
                    aria-label={`Horas de resolución prioridad ${p}`}
                  />
                </td>
                <td className="px-4 py-3">
                  <Input
                    type="number"
                    min={1}
                    value={borradorRespuesta[p]}
                    onChange={(e) =>
                      setBorradorRespuesta((b) => ({
                        ...b,
                        [p]: Math.max(1, Number(e.target.value) || 1),
                      }))
                    }
                    className="h-9 w-28"
                    aria-label={`Horas de primera respuesta prioridad ${p}`}
                  />
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {slaPorDefecto[p]} h · {slaRespuestaPorDefecto[p]} h
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          className="h-10"
          onClick={() => {
            guardarSla(borrador);
            guardarSlaRespuesta(borradorRespuesta);
            setGuardado(true);
          }}
        >
          Guardar cambios
        </Button>
        <Button
          variant="outline"
          className="h-10"
          onClick={() => {
            setBorrador(slaPorDefecto);
            setBorradorRespuesta(slaRespuestaPorDefecto);
          }}
        >
          Restaurar valores por defecto
        </Button>
        {guardado && (
          <span className="flex items-center gap-1.5 text-sm text-baja">
            <Check className="size-4" /> Cambios guardados
          </span>
        )}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Una OT queda “Por vencer” en el último 20% de su plazo y “Vencida” al superarlo. El SLA de primera
        respuesta se mide desde el ingreso del ticket hasta la primera respuesta enviada al cliente.
      </p>
    </div>
  );
}
