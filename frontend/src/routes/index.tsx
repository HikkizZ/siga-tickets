import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { GanttChartSquare, Inbox, Paperclip, Search, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { AvataresEquipo, PrioridadBadge, SlaBadge } from "@/components/Prioridad";
import { cn } from "@/lib/utils";
import {
  ESTADOS_OT,
  clientes,
  nivelSla,
  formatoFecha,
  getUsuario,
  usuarioActual,
  usuarios,
  type OT,
} from "@/lib/mock-data";
import { useOTStore } from "@/lib/ot-store";

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

function Tarjeta({ ot }: { ot: OT }) {
  const { abrirOT, sla } = useOTStore();
  const responsable = getUsuario(ot.responsableId);
  const nivel = nivelSla(ot, sla);
  const atrasada = nivel === "Vencida";

  return (
    <article
      onClick={() => abrirOT(ot.id)}
      className="cursor-pointer rounded-xl border border-border bg-card p-3.5 card-elev transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:card-elev-hover"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] tracking-tight text-muted-foreground">{ot.id}</span>
        <PrioridadBadge prioridad={ot.prioridad} />
      </div>
      <h3 className="mt-2 text-sm font-semibold leading-snug tracking-tight">{ot.titulo}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{ot.cliente}</p>
      <div className="mt-2">
        <SlaBadge nivel={nivel} />
      </div>
      <div className="mt-3.5 flex items-center gap-2">
        <AvataresEquipo responsableId={ot.responsableId} colaboradores={ot.colaboradores} />
        <span className="text-xs text-muted-foreground">{responsable.nombre.split(" ")[0]}</span>
        {ot.adjuntos.length > 0 && (
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <Paperclip className="size-3.5" />
            {ot.adjuntos.length}
          </span>
        )}
        <span
          className={cn(
            "flex items-center gap-1 font-mono text-[11px]",
            ot.adjuntos.length > 0 ? "" : "ml-auto",
            atrasada ? "font-semibold text-alta" : "text-muted-foreground",
          )}
        >
          {atrasada && <TriangleAlert className="size-3.5" />}
          {formatoFecha(ot.fechaEstimada)}
        </span>
      </div>
    </article>
  );
}

function Tablero() {
  const { ots } = useOTStore();
  const [texto, setTexto] = useState("");
  const [prioridad, setPrioridad] = useState("todas");
  const [responsable, setResponsable] = useState("todos");
  const [cliente, setCliente] = useState("todos");
  const [misAsignados, setMisAsignados] = useState(false);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setCargando(false), 450);
    return () => clearTimeout(t);
  }, []);

  const filtradas = useMemo(
    () =>
      ots.filter(
        (ot) =>
          (!misAsignados ||
            ot.responsableId === usuarioActual.id ||
            (ot.colaboradores ?? []).includes(usuarioActual.id)) &&
          (prioridad === "todas" || ot.prioridad === prioridad) &&
          (responsable === "todos" || ot.responsableId === responsable) &&
          (cliente === "todos" || ot.cliente === cliente) &&
          (texto.trim() === "" ||
            `${ot.id} ${ot.titulo} ${ot.cliente} ${ot.descripcion}`
              .toLowerCase()
              .includes(texto.toLowerCase())),
      ),
    [ots, prioridad, responsable, cliente, texto, misAsignados],
  );

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
            <span>{prioridad === "todas" ? "Prioridad" : prioridad}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Toda prioridad</SelectItem>
            <SelectItem value="Alta">Alta</SelectItem>
            <SelectItem value="Media">Media</SelectItem>
            <SelectItem value="Baja">Baja</SelectItem>
          </SelectContent>
        </Select>
        <Select value={responsable} onValueChange={setResponsable}>
          <SelectTrigger className="h-9 w-44 text-sm">
            <span>
              {responsable === "todos" ? "Responsable" : getUsuario(responsable).nombre}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todo responsable</SelectItem>
            {usuarios.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={cliente} onValueChange={setCliente}>
          <SelectTrigger className="h-9 w-52 text-sm">
            <span>{cliente === "todos" ? "Cliente" : cliente}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todo cliente</SelectItem>
            {clientes.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={misAsignados ? "default" : "outline"}
          className="h-9 text-sm"
          onClick={() => setMisAsignados((v) => !v)}
        >
          Mis asignados
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtradas.length} de {ots.length} OT
        </span>
        <Link
          to="/linea-de-tiempo"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm transition-colors hover:bg-muted"
        >
          <GanttChartSquare className="size-4" /> Línea de tiempo
        </Link>
      </div>

      <div className="flex min-w-0 flex-1 gap-3 overflow-x-auto p-4">
        {ESTADOS_OT.map((estado) => {
          const items = filtradas.filter((o) => o.estado === estado);
          return (
            <section
              key={estado}
              className="flex w-72 shrink-0 flex-col rounded-xl border border-border bg-secondary/70"
            >
              <header className="flex items-center justify-between px-3.5 py-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {estado}
                </h2>
                <span className="rounded-full bg-card px-2 py-0.5 font-mono text-[11px] text-muted-foreground card-elev">
                  {items.length}
                </span>
              </header>
              <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-2.5 pb-3">
                {cargando ? (
                  <>
                    <Skeleton className="h-28 rounded-xl" />
                    <Skeleton className="h-28 rounded-xl" />
                  </>
                ) : (
                  items.map((ot) => <Tarjeta key={ot.id} ot={ot} />)
                )}
                {!cargando && items.length === 0 && (
                  <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-8 text-center">
                    <Inbox className="size-4 text-muted-foreground" />
                    <p className="text-xs font-medium">Nada en “{estado}”</p>
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
