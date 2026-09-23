import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Avatar, PrioridadBadge, SlaBadge } from "@/components/Prioridad";
import { cn, inicialesDeNombre } from "@/lib/utils";
import { formatoFecha } from "@/lib/mock-data";
import { PRIORIDADES, etiquetaEstadoOt, etiquetaPrioridad } from "@/lib/labels";
import { useOts } from "@/hooks/useOts";
import type { OtsFiltros } from "@/lib/api/ots";
import { useOTStore } from "@/lib/ot-store";
import { useUsuarios } from "@/hooks/useUsuarios";
import { useClientes } from "@/hooks/useClientes";
import { useDebounced } from "@/hooks/useDebounced";

export const Route = createFileRoute("/todas-las-ot")({
  head: () => ({
    meta: [
      { title: "Todas las OT · Taller OT" },
      {
        name: "description",
        content:
          "Tabla completa de órdenes de trabajo con estado, prioridad, responsable, fechas y SLA.",
      },
      { property: "og:title", content: "Todas las OT · Taller OT" },
      {
        property: "og:description",
        content: "Ordena y filtra todas las órdenes de trabajo del taller en una sola tabla.",
      },
    ],
  }),
  component: TodasLasOT,
});

const PER_PAGE = 25;

type Columna = "id" | "titulo" | "cliente" | "estado" | "prioridad" | "responsable" | "fechaIngreso" | "fechaEstimada" | "sla";

// El backend solo acepta ordenar por estos campos (docs/api.md, GET /ots) — responsable, cliente
// y SLA no están entre las columnas ordenables ahí, así que esas tres quedan sin botón de orden
// (antes se ordenaban en el cliente sobre el arreglo completo; ahora la tabla está paginada por
// el servidor, así que un orden "local" sobre una sola página daría un resultado engañoso).
const ordenPorColumna: Partial<Record<Columna, NonNullable<OtsFiltros["orden"]>>> = {
  id: "numero",
  titulo: "titulo",
  estado: "estado",
  prioridad: "prioridad",
  fechaIngreso: "fechaIngreso",
  fechaEstimada: "fechaEstimadaTermino",
};

const columnas: { key: Columna; label: string; alineado?: string }[] = [
  { key: "id", label: "ID" },
  { key: "titulo", label: "Título" },
  { key: "cliente", label: "Cliente" },
  { key: "estado", label: "Estado" },
  { key: "prioridad", label: "Prioridad" },
  { key: "responsable", label: "Responsable" },
  { key: "fechaIngreso", label: "Ingreso" },
  { key: "fechaEstimada", label: "Estimada" },
  { key: "sla", label: "SLA" },
];

function TodasLasOT() {
  const { abrirOT } = useOTStore();
  const [texto, setTexto] = useState("");
  const [prioridad, setPrioridad] = useState("todas");
  const [responsable, setResponsable] = useState("todos");
  const [cliente, setCliente] = useState("todos");
  const [misAsignados, setMisAsignados] = useState(false);
  const [orden, setOrden] = useState<{ col: Columna; asc: boolean }>({ col: "id", asc: true });
  const [page, setPage] = useState(1);

  const textoDebounced = useDebounced(texto);
  const { data: usuarios } = useUsuarios();
  const { data: clientes } = useClientes();

  // Cambiar cualquier filtro u orden vuelve a la página 1 — si no, se podría quedar en una
  // página fuera de rango del nuevo resultado.
  useEffect(() => {
    setPage(1);
  }, [textoDebounced, prioridad, responsable, cliente, misAsignados, orden]);

  const filtros: OtsFiltros = {
    page,
    perPage: PER_PAGE,
    orden: ordenPorColumna[orden.col] ?? "fechaIngreso",
    dir: orden.asc ? "asc" : "desc",
    q: textoDebounced.trim() || undefined,
    prioridad: prioridad === "todas" ? undefined : (prioridad as (typeof PRIORIDADES)[number]),
    responsableId: responsable === "todos" ? undefined : responsable,
    clienteId: cliente === "todos" ? undefined : cliente,
    mios: misAsignados || undefined,
  };
  const { data, isLoading } = useOts(filtros);
  const filas = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Todas las OT</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Vista de tabla con orden y filtros.</p>
        </div>
        <Link
          to="/nueva-ot"
          className="ml-auto inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground card-elev hover:bg-primary/90 hover:card-elev-hover"
        >
          <Plus className="size-4" /> Nueva OT
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
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
        <button
          onClick={() => setMisAsignados((v) => !v)}
          className={cn(
            "h-9 rounded-md border px-3 text-sm transition-colors",
            misAsignados ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
          )}
        >
          Mis asignados
        </button>
        <span className="text-xs text-muted-foreground sm:ml-auto">
          {total} OT · página {page} de {totalPaginas}
        </span>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card card-elev">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              {columnas.map((c) => {
                const clave = ordenPorColumna[c.key];
                return (
                  <th key={c.key} className={cn("px-4 py-2.5 font-medium", c.alineado)}>
                    {clave ? (
                      <button
                        onClick={() => setOrden((o) => (o.col === c.key ? { col: c.key, asc: !o.asc } : { col: c.key, asc: true }))}
                        className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                      >
                        {c.label}
                        {orden.col === c.key && (orden.asc ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={columnas.length} className="px-4 py-14 text-center text-sm text-muted-foreground">
                  Cargando…
                </td>
              </tr>
            )}
            {!isLoading &&
              filas.map((ot) => (
                <tr
                  key={ot.id}
                  onClick={() => abrirOT(ot.id)}
                  className="cursor-pointer border-b border-border/70 transition-colors last:border-0 hover:bg-accent/45"
                >
                  <td className="px-4 py-3 font-mono text-xs">{ot.numero}</td>
                  <td className="max-w-72 truncate px-4 py-3">{ot.titulo}</td>
                  <td className="px-4 py-3">{ot.cliente?.nombre ?? ot.areaInterna ?? "Interno"}</td>
                  <td className="px-4 py-3">
                    <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      {etiquetaEstadoOt(ot.estado)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <PrioridadBadge prioridad={ot.prioridad} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <Avatar iniciales={inicialesDeNombre(ot.responsable.nombre)} />
                      <span className="text-xs">{ot.responsable.nombre}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{formatoFecha(ot.fechaIngreso)}</td>
                  <td
                    className={cn(
                      "px-4 py-3 font-mono text-xs",
                      ot.slaEstado === "vencida" ? "font-semibold text-alta" : "text-muted-foreground",
                    )}
                  >
                    {ot.fechaEstimadaTermino ? formatoFecha(ot.fechaEstimadaTermino) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <SlaBadge nivel={ot.slaEstado} />
                  </td>
                </tr>
              ))}
            {!isLoading && filas.length === 0 && (
              <tr>
                <td colSpan={columnas.length} className="px-4 py-14">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <Search className="size-4" />
                    </span>
                    <p className="text-sm font-medium">Ninguna OT coincide con estos filtros</p>
                    <p className="max-w-sm text-xs text-muted-foreground">
                      Prueba con otro texto, prioridad, responsable o cliente para ver más resultados.
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPaginas > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2">
          <Button size="sm" variant="outline" className="h-8" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="size-4" /> Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            Página {page} de {totalPaginas}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            disabled={page >= totalPaginas}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
