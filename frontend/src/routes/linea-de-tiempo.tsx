import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { KanbanSquare, TriangleAlert } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Avatar, PrioridadBadge, SlaBadge } from "@/components/Prioridad";
import { cn, inicialesDeNombre } from "@/lib/utils";
import { formatoFecha } from "@/lib/mock-data";
import { PRIORIDADES } from "@/lib/labels";
import { useOTStore } from "@/lib/ot-store";
import { useOts } from "@/hooks/useOts";
import type { OtListItem } from "@/lib/api/ots";

export const Route = createFileRoute("/linea-de-tiempo")({
  head: () => ({
    meta: [
      { title: "Línea de tiempo de OT · Taller OT" },
      {
        name: "description",
        content:
          "Vista de calendario horizontal de las órdenes de trabajo, agrupadas por responsable o cliente, con alertas de atraso.",
      },
      { property: "og:title", content: "Línea de tiempo de OT · Taller OT" },
      {
        property: "og:description",
        content: "Revisa de un vistazo qué órdenes de trabajo están atrasadas y quién las tiene a cargo.",
      },
    ],
  }),
  component: LineaDeTiempo,
});

// Solo se puede dibujar una barra para una OT que tiene fecha estimada de término (el mock la
// exigía siempre; en el backend real es opcional — nace null hasta que alguien la define).
type OtConRango = OtListItem & { fechaEstimadaTermino: string };

function tieneRango(ot: OtListItem): ot is OtConRango {
  return ot.fechaEstimadaTermino !== null;
}

function nombreGrupo(ot: OtListItem, agrupar: "responsable" | "cliente"): string {
  if (agrupar === "responsable") return ot.responsable.nombre;
  return ot.cliente?.nombre ?? ot.areaInterna ?? "Interno";
}

function Barra({
  ot,
  inicio,
  total,
  onAbrir,
}: {
  ot: OtConRango;
  inicio: number;
  total: number;
  onAbrir: (id: string) => void;
}) {
  const pct = (fecha: string) => ((new Date(fecha + "T12:00:00").getTime() - inicio) / total) * 100;
  const izq = Math.max(0, pct(ot.fechaIngreso));
  const der = Math.min(100, pct(ot.fechaEstimadaTermino));
  const atrasada = ot.slaEstado === "vencida";

  return (
    <button
      onClick={() => onAbrir(ot.id)}
      title={`${ot.numero} · ${ot.titulo}`}
      style={{ left: `${izq}%`, width: `${Math.max(der - izq, 3)}%` }}
      className={cn(
        "absolute top-1.5 flex h-7 items-center gap-2 overflow-hidden rounded border px-2 text-left text-[11px] transition-colors",
        atrasada
          ? "border-alta/40 bg-alta-suave text-alta hover:bg-alta-suave/70"
          : "border-primary/30 bg-accent text-accent-foreground hover:bg-accent/70",
      )}
    >
      {atrasada && <TriangleAlert className="size-3 shrink-0" />}
      <span className="truncate font-medium">{ot.titulo}</span>
      <span className="hidden shrink-0 lg:inline">
        <SlaBadge nivel={ot.slaEstado} className="py-0" />
      </span>
      <span className="ml-auto hidden shrink-0 font-mono opacity-70 xl:inline">
        {formatoFecha(ot.fechaEstimadaTermino)}
      </span>
    </button>
  );
}

function LineaDeTiempo() {
  const { abrirOT } = useOTStore();
  const [agrupar, setAgrupar] = useState<"responsable" | "cliente">("responsable");
  // 100 alcanza sobradamente para el volumen de un equipo de ~8 personas (mismo criterio que el
  // resto de las listas reales de la app); si algún día no alcanza, hace falta un endpoint propio
  // en vez de subir este número indefinidamente.
  const { data, isLoading } = useOts({ perPage: 100 });
  const items = useMemo(() => (data?.items ?? []).filter(tieneRango), [data]);

  const hoy = new Date().getTime();
  const rango = useMemo(() => {
    if (items.length === 0) return null;
    const inicios = items.map((o) => new Date(o.fechaIngreso + "T12:00:00").getTime());
    const fines = items.map((o) => new Date(o.fechaEstimadaTermino + "T12:00:00").getTime());
    // Un margen de una semana a cada lado para que las barras de los extremos no queden pegadas
    // al borde del panel.
    const semana = 7 * 86400000;
    const inicio = Math.min(...inicios, hoy) - semana;
    const fin = Math.max(...fines, hoy) + semana;
    return { inicio, fin, total: fin - inicio };
  }, [items, hoy]);

  const grupos = useMemo(() => {
    const mapa = new Map<string, OtConRango[]>();
    for (const ot of items) {
      const clave = nombreGrupo(ot, agrupar);
      mapa.set(clave, [...(mapa.get(clave) ?? []), ot]);
    }
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [items, agrupar]);

  const atrasadas = items.filter((o) => o.slaEstado === "vencida");

  const semanas = useMemo(() => {
    if (!rango) return [];
    const marcas: { label: string; left: number }[] = [];
    const d = new Date(rango.inicio);
    while (d.getTime() < rango.fin) {
      marcas.push({
        label: d.toLocaleDateString("es-CL", { day: "2-digit", month: "short" }),
        left: ((d.getTime() - rango.inicio) / rango.total) * 100,
      });
      d.setDate(d.getDate() + 7);
    }
    return marcas;
  }, [rango]);

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-lg font-semibold">Línea de tiempo</h1>
          <p className="text-sm text-muted-foreground">
            Desde la fecha de ingreso hasta el término estimado de cada OT.
          </p>
        </div>
        <Select value={agrupar} onValueChange={(v) => setAgrupar(v as "responsable" | "cliente")}>
          <SelectTrigger className="ml-auto h-9 w-48 text-sm">
            <span>{agrupar === "responsable" ? "Agrupar por responsable" : "Agrupar por cliente"}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="responsable">Agrupar por responsable</SelectItem>
            <SelectItem value="cliente">Agrupar por cliente</SelectItem>
          </SelectContent>
        </Select>
        <Link
          to="/"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm transition-colors hover:bg-muted"
        >
          <KanbanSquare className="size-4" /> Tablero
        </Link>
      </div>

      {atrasadas.length > 0 && (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-alta/25 bg-alta-suave px-3 py-2 text-sm text-alta">
          <TriangleAlert className="size-4" />
          {atrasadas.length} OT con SLA vencido: {atrasadas.map((o) => o.numero).join(", ")}
        </div>
      )}

      {isLoading && <p className="mt-6 text-sm text-muted-foreground">Cargando…</p>}

      {!isLoading && items.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          Ninguna OT tiene fecha estimada de término todavía, así que no hay nada que dibujar.
        </p>
      )}

      {!isLoading && rango && items.length > 0 && (
        <div className="mt-5 overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex border-b border-border bg-secondary/60">
            <div className="w-52 shrink-0 px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
              {agrupar === "responsable" ? "Responsable" : "Cliente"}
            </div>
            <div className="relative h-8 flex-1">
              {semanas.map((s) => (
                <span
                  key={s.label}
                  style={{ left: `${s.left}%` }}
                  className="absolute top-2 -translate-x-1/2 font-mono text-[10px] text-muted-foreground"
                >
                  {s.label}
                </span>
              ))}
            </div>
          </div>

          {grupos.map(([clave, otsGrupo]) => (
            <div key={clave} className="flex border-b border-border last:border-0">
              <div className="w-52 shrink-0 border-r border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  {agrupar === "responsable" && <Avatar iniciales={inicialesDeNombre(clave)} />}
                  <span className="text-sm font-medium">{clave}</span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{otsGrupo.length} OT</p>
              </div>
              <div className="relative flex-1">
                <span
                  style={{ left: `${((hoy - rango.inicio) / rango.total) * 100}%` }}
                  className="absolute inset-y-0 z-10 w-px bg-primary/60"
                />
                {otsGrupo.map((ot, i) => (
                  <div key={ot.id} className={cn("relative h-10", i > 0 && "border-t border-dashed border-border/60")}>
                    <Barra ot={ot} inicio={rango.inicio} total={rango.total} onAbrir={abrirOT} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="h-3 w-6 rounded border border-primary/30 bg-accent" /> En plazo
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-6 rounded border border-alta/40 bg-alta-suave" /> SLA vencido
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-px bg-primary/60" /> Hoy
        </span>
        <span className="ml-2 flex items-center gap-2">
          Prioridades:{" "}
          {PRIORIDADES.map((p) => (
            <PrioridadBadge key={p} prioridad={p} />
          ))}
        </span>
      </div>
    </div>
  );
}
