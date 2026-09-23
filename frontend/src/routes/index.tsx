import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { GanttChartSquare, Inbox, LayoutGrid, LayoutList, Paperclip, Search, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Avatar, PrioridadBadge, SlaBadge } from "@/components/Prioridad";
import { cn, inicialesDeNombre } from "@/lib/utils";
import { formatoFecha } from "@/lib/mock-data";
import { ESTADOS_OT, PRIORIDADES, etiquetaEstadoOt, etiquetaPrioridad } from "@/lib/labels";
import { useOtsKanban } from "@/hooks/useOts";
import type { OtKanbanItem } from "@/lib/api/ots";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useOTStore } from "@/lib/ot-store";
import { useUsuarios } from "@/hooks/useUsuarios";
import { useClientes } from "@/hooks/useClientes";
import { useDebounced } from "@/hooks/useDebounced";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tablero de OT · Taller OT" },
      {
        name: "description",
        content:
          "Tablero kanban interno para seguir órdenes de trabajo por estado, prioridad, responsable y cliente.",
      },
      { property: "og:title", content: "Tablero de OT · Taller OT" },
      {
        property: "og:description",
        content: "Seguimiento diario de órdenes de trabajo y cotizaciones para equipos de servicio.",
      },
    ],
  }),
  component: Tablero,
});

type Densidad = "comodo" | "compacto";

// Preferencia solo de UI, no crítica: mismo criterio try/catch + guard de `window` que
// src/lib/auth/token.ts para localStorage (SSR / modo privado). Se lee en un efecto (no en el
// estado inicial) para no desalinear el render de servidor con el de cliente.
const DENSIDAD_KEY = "siga-ot:tablero-densidad";

function leerDensidadGuardada(): Densidad | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(DENSIDAD_KEY);
    return v === "compacto" || v === "comodo" ? v : null;
  } catch {
    return null;
  }
}

function guardarDensidad(v: Densidad): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DENSIDAD_KEY, v);
  } catch {
    // preferencia no persiste, sin impacto funcional
  }
}

function ClusterEquipo({ ot, compacto }: { ot: OtKanbanItem; compacto?: boolean }) {
  const extras = ot.colaboradores.items;
  const restantes = ot.colaboradores.total - extras.length;
  const tamano = compacto ? "size-4 text-[8px]" : undefined;
  return (
    <span
      className="flex items-center"
      title={[ot.responsable.nombre, ...extras.map((u) => u.nombre)].join(", ")}
    >
      <Avatar iniciales={inicialesDeNombre(ot.responsable.nombre)} className={cn("ring-2 ring-card", tamano)} />
      {extras.map((u) => (
        <Avatar
          key={u.id}
          iniciales={inicialesDeNombre(u.nombre)}
          className={cn("-ml-2 bg-muted text-muted-foreground ring-2 ring-card", tamano)}
        />
      ))}
      {restantes > 0 && (
        <span
          className={cn(
            "-ml-2 flex items-center justify-center rounded-full bg-accent font-semibold text-accent-foreground ring-2 ring-card",
            compacto ? "size-4 text-[8px]" : "size-6 text-[10px]",
          )}
        >
          +{restantes}
        </span>
      )}
    </span>
  );
}

// Tarjeta "cómoda" (diseño original) y "compacta" (Fase E1: más OT visibles sin scroll —
// número+título+prioridad en una línea, SLA/responsable/fecha en otra, sin el bloque de cliente
// ni el respiro entre secciones). Dos ramas de render en vez de clases condicionales por línea:
// son dos densidades visualmente distintas, no una variación menor de una sola.
function Tarjeta({ ot, compacto }: { ot: OtKanbanItem; compacto: boolean }) {
  const { abrirOT } = useOTStore();
  const atrasada = ot.slaEstado === "vencida";

  if (compacto) {
    return (
      <article
        onClick={() => abrirOT(ot.id)}
        className="cursor-pointer rounded-lg border border-border bg-card px-2.5 py-2 card-elev transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:card-elev-hover"
      >
        <div className="flex items-center gap-1.5">
          <span className="shrink-0 font-mono text-[10px] tracking-tight text-muted-foreground">{ot.numero}</span>
          <h3 className="min-w-0 flex-1 truncate text-xs font-semibold leading-snug tracking-tight" title={ot.titulo}>
            {ot.titulo}
          </h3>
          <PrioridadBadge prioridad={ot.prioridad} className="shrink-0 gap-1 px-1 py-0 text-[10px]" />
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <SlaBadge nivel={ot.slaEstado} className="shrink-0 gap-0.5 px-1 py-0 text-[10px]" />
          <span className="ml-auto flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
            <ClusterEquipo ot={ot} compacto />
            <span className="truncate">{ot.responsable.nombre.split(" ")[0]}</span>
          </span>
          {ot.fechaEstimadaTermino && (
            <span
              className={cn(
                "flex shrink-0 items-center gap-0.5 font-mono text-[10px]",
                atrasada ? "font-semibold text-alta" : "text-muted-foreground",
              )}
            >
              {atrasada && <TriangleAlert className="size-3" />}
              {formatoFecha(ot.fechaEstimadaTermino)}
            </span>
          )}
        </div>
      </article>
    );
  }

  return (
    <article
      onClick={() => abrirOT(ot.id)}
      className="cursor-pointer rounded-xl border border-border bg-card p-3.5 card-elev transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:card-elev-hover"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] tracking-tight text-muted-foreground">{ot.numero}</span>
        <PrioridadBadge prioridad={ot.prioridad} />
      </div>
      <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-snug tracking-tight">{ot.titulo}</h3>
      <p className="mt-1 truncate text-xs text-muted-foreground">{ot.cliente?.nombre ?? ot.areaInterna ?? "Interno"}</p>
      <div className="mt-2">
        <SlaBadge nivel={ot.slaEstado} />
      </div>
      <div className="mt-3.5 flex items-center gap-2">
        <ClusterEquipo ot={ot} />
        <span className="text-xs text-muted-foreground">{ot.responsable.nombre.split(" ")[0]}</span>
        {ot.adjuntosCount > 0 && (
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <Paperclip className="size-3.5" />
            {ot.adjuntosCount}
          </span>
        )}
        {ot.fechaEstimadaTermino && (
          <span
            className={cn(
              "flex items-center gap-1 font-mono text-[11px]",
              ot.adjuntosCount > 0 ? "" : "ml-auto",
              atrasada ? "font-semibold text-alta" : "text-muted-foreground",
            )}
          >
            {atrasada && <TriangleAlert className="size-3.5" />}
            {formatoFecha(ot.fechaEstimadaTermino)}
          </span>
        )}
      </div>
    </article>
  );
}

function Tablero() {
  const { usuario } = useAuth();
  const [texto, setTexto] = useState("");
  const [prioridad, setPrioridad] = useState("todas");
  const [responsable, setResponsable] = useState("todos");
  const [cliente, setCliente] = useState("todos");
  const [misAsignados, setMisAsignados] = useState(false);
  // Empieza en "comodo" (mismo render que el servidor) y se alinea con lo guardado recién
  // montado, para no desajustar la hidratación — ver leerDensidadGuardada().
  const [densidad, setDensidad] = useState<Densidad>("comodo");
  useEffect(() => {
    const guardada = leerDensidadGuardada();
    if (guardada) setDensidad(guardada);
  }, []);

  const textoDebounced = useDebounced(texto);
  const { data: usuarios } = useUsuarios();
  const { data: clientes } = useClientes();

  const { data: columnas, isLoading } = useOtsKanban({
    q: textoDebounced.trim() || undefined,
    prioridad: prioridad === "todas" ? undefined : (prioridad as (typeof PRIORIDADES)[number]),
    responsableId: responsable === "todos" ? undefined : responsable,
    clienteId: cliente === "todos" ? undefined : cliente,
    mios: misAsignados || undefined,
  });

  const totalFiltradas = (columnas ?? []).reduce((s, c) => s + c.total, 0);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-w-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-3 sm:px-6">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Filtrar OT…"
            className="h-9 pl-9 text-sm"
          />
        </div>
        <Select value={prioridad} onValueChange={setPrioridad}>
          <SelectTrigger className="h-9 w-36 text-sm">
            <span>{prioridad === "todas" ? "Prioridad" : etiquetaPrioridad(prioridad as (typeof PRIORIDADES)[number])}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Toda prioridad</SelectItem>
            {PRIORIDADES.map((p) => (
              <SelectItem key={p} value={p}>
                {etiquetaPrioridad(p)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={responsable} onValueChange={setResponsable}>
          <SelectTrigger className="h-9 w-44 text-sm">
            <span>{responsable === "todos" ? "Responsable" : (usuarios?.find((u) => u.id === responsable)?.nombre ?? "Responsable")}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todo responsable</SelectItem>
            {(usuarios ?? []).map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={cliente} onValueChange={setCliente}>
          <SelectTrigger className="h-9 w-52 text-sm">
            <span>{cliente === "todos" ? "Cliente" : (clientes?.find((c) => c.id === cliente)?.nombre ?? "Cliente")}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todo cliente</SelectItem>
            {(clientes ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={misAsignados ? "default" : "outline"}
          className="h-9 text-sm"
          onClick={() => setMisAsignados((v) => !v)}
          disabled={!usuario}
        >
          Mis asignados
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">{totalFiltradas} OT</span>
        <Button
          variant="outline"
          className="h-9 text-sm"
          title={densidad === "compacto" ? "Cambiar a vista cómoda" : "Cambiar a vista compacta"}
          onClick={() =>
            setDensidad((d) => {
              const siguiente = d === "compacto" ? "comodo" : "compacto";
              guardarDensidad(siguiente);
              return siguiente;
            })
          }
        >
          {densidad === "compacto" ? <LayoutList className="size-4" /> : <LayoutGrid className="size-4" />}
          {densidad === "compacto" ? "Cómodo" : "Compacto"}
        </Button>
        <Link
          to="/linea-de-tiempo"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm transition-colors hover:bg-muted"
        >
          <GanttChartSquare className="size-4" /> Línea de tiempo
        </Link>
      </div>

      <div className="flex min-w-0 flex-1 gap-3 overflow-x-auto p-4">
        {ESTADOS_OT.map((estado) => {
          const columna = columnas?.find((c) => c.estado === estado);
          const items = columna?.ots ?? [];
          return (
            <section
              key={estado}
              className="flex w-72 shrink-0 flex-col rounded-xl border border-border bg-secondary/70"
            >
              <header className="flex items-center justify-between px-3.5 py-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {etiquetaEstadoOt(estado)}
                </h2>
                <span className="rounded-full bg-card px-2 py-0.5 font-mono text-[11px] text-muted-foreground card-elev">
                  {columna?.total ?? 0}
                </span>
              </header>
              <div className={cn("flex flex-1 flex-col overflow-y-auto px-2.5 pb-3", densidad === "compacto" ? "gap-1.5" : "gap-2.5")}>
                {isLoading ? (
                  <>
                    <Skeleton className={densidad === "compacto" ? "h-14 rounded-lg" : "h-28 rounded-xl"} />
                    <Skeleton className={densidad === "compacto" ? "h-14 rounded-lg" : "h-28 rounded-xl"} />
                  </>
                ) : (
                  items.map((ot) => <Tarjeta key={ot.id} ot={ot} compacto={densidad === "compacto"} />)
                )}
                {!isLoading && items.length === 0 && (
                  <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-8 text-center">
                    <Inbox className="size-4 text-muted-foreground" />
                    <p className="text-xs font-medium">Nada en "{etiquetaEstadoOt(estado)}"</p>
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      Cambia el estado desde el detalle de una OT para que aparezca acá.
                    </p>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
