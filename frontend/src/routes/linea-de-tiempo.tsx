import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { KanbanSquare, TriangleAlert } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Avatar, PrioridadBadge, SlaBadge } from "@/components/Prioridad";
import { cn } from "@/lib/utils";
import { formatoFecha, getUsuario, nivelSla, type OT } from "@/lib/mock-data";
import { useOTStore } from "@/lib/ot-store";

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

const INICIO = new Date("2026-07-27T12:00:00");
const FIN = new Date("2026-10-05T12:00:00");
const TOTAL = FIN.getTime() - INICIO.getTime();
const HOY = new Date("2026-09-10T12:00:00");

const pct = (fecha: string) =>
  ((new Date(fecha + "T12:00:00").getTime() - INICIO.getTime()) / TOTAL) * 100;

const semanas = () => {
  const marcas: { label: string; left: number }[] = [];
  const d = new Date(INICIO);
  while (d < FIN) {
    marcas.push({
      label: d.toLocaleDateString("es-CL", { day: "2-digit", month: "short" }),
      left: ((d.getTime() - INICIO.getTime()) / TOTAL) * 100,
    });
    d.setDate(d.getDate() + 7);
  }
  return marcas;
};

function Barra({ ot }: { ot: OT }) {
  const { abrirOT, sla } = useOTStore();
  const nivel = nivelSla(ot, sla);
  const izq = Math.max(0, pct(ot.fechaIngreso));
  const der = Math.min(100, pct(ot.fechaEstimada));
  const atrasada = nivel === "Vencida";

  return (
    <button
      onClick={() => abrirOT(ot.id)}
      title={`${ot.id} · ${ot.titulo}`}
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
        <SlaBadge nivel={nivel} className="py-0" />
      </span>
      <span className="ml-auto hidden shrink-0 font-mono opacity-70 xl:inline">
        {formatoFecha(ot.fechaEstimada)}
      </span>
    </button>
  );
}

function LineaDeTiempo() {
  const { ots, sla } = useOTStore();
  const [agrupar, setAgrupar] = useState<"responsable" | "cliente">("responsable");

  const grupos = useMemo(() => {
    const mapa = new Map<string, OT[]>();
    for (const ot of ots) {
      const clave = agrupar === "responsable" ? getUsuario(ot.responsableId).nombre : ot.cliente;
      mapa.set(clave, [...(mapa.get(clave) ?? []), ot]);
    }
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [ots, agrupar]);

  const atrasadas = ots.filter((o) => nivelSla(o, sla) === "Vencida");

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
          {atrasadas.length} OT con SLA vencido: {atrasadas.map((o) => o.id).join(", ")}
        </div>
      )}

      <div className="mt-5 overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex border-b border-border bg-secondary/60">
          <div className="w-52 shrink-0 px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            {agrupar === "responsable" ? "Responsable" : "Cliente"}
          </div>
          <div className="relative h-8 flex-1">
            {semanas().map((s) => (
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

        {grupos.map(([clave, items]) => (
          <div key={clave} className="flex border-b border-border last:border-0">
            <div className="w-52 shrink-0 border-r border-border px-4 py-3">
              <div className="flex items-center gap-2">
                {agrupar === "responsable" && (
                  <Avatar iniciales={clave.split(" ").map((p) => p[0]).join("").slice(0, 2)} />
                )}
                <span className="text-sm font-medium">{clave}</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{items.length} OT</p>
            </div>
            <div className="relative flex-1">
              <span
                style={{ left: `${((HOY.getTime() - INICIO.getTime()) / TOTAL) * 100}%` }}
                className="absolute inset-y-0 z-10 w-px bg-primary/60"
              />
              {items.map((ot, i) => (
                <div key={ot.id} className={cn("relative h-10", i > 0 && "border-t border-dashed border-border/60")}>
                  <Barra ot={ot} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

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
          Prioridades: <PrioridadBadge prioridad="Alta" /> <PrioridadBadge prioridad="Media" />{" "}
          <PrioridadBadge prioridad="Baja" />
        </span>
      </div>
    </div>
  );
}
