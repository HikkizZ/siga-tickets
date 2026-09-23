import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { AvataresEquipo, PrioridadBadge, SlaBadge } from "@/components/Prioridad";
import { cn } from "@/lib/utils";
import {
  clientes,
  formatoFecha,
  getUsuario,
  nivelSla,
  usuarioActual,
  usuarios,
  vencimientoSla,
  type OT,
  type SlaConfig,
} from "@/lib/mock-data";
import { useOTStore } from "@/lib/ot-store";

export const Route = createFileRoute("/todas-las-ot")({
  head: () => ({
    meta: [
      { title: "Todas las OT · Taller OT" },
      {
        name: "description",
        content:
          "Tabla completa de órdenes de trabajo con estado, prioridad, responsable, fechas, horas y cotización vinculada.",
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

type Columna =
  | "id"
  | "titulo"
  | "cliente"
  | "estado"
  | "prioridad"
  | "responsable"
  | "fechaIngreso"
  | "fechaEstimada"
  | "sla"
  | "horas"
  | "cotizacion";

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
  { key: "horas", label: "Horas", alineado: "text-right" },
  { key: "cotizacion", label: "Cotización" },
];

const ordenPrioridad = { Alta: 0, Media: 1, Baja: 2 } as const;
const ordenSla = { Vencida: 0, "Por vencer": 1, "En plazo": 2 } as const;

function TodasLasOT() {
  const { ots, abrirOT, sla } = useOTStore();
  const [texto, setTexto] = useState("");
  const [prioridad, setPrioridad] = useState("todas");
  const [responsable, setResponsable] = useState("todos");
  const [cliente, setCliente] = useState("todos");
  const [orden, setOrden] = useState<{ col: Columna; asc: boolean }>({ col: "id", asc: true });
  const [misAsignados, setMisAsignados] = useState(false);

  const valor = (ot: OT, col: Columna, cfg: SlaConfig): string | number => {
    switch (col) {
      case "sla":
        return ordenSla[nivelSla(ot, cfg)];
      case "prioridad":
        return ordenPrioridad[ot.prioridad];
      case "responsable":
        return getUsuario(ot.responsableId).nombre;
      case "horas":
        return ot.horas.reduce((s, h) => s + h.horas, 0);
      case "cotizacion":
        return ot.cotizacionId ?? "";
      default:
        return ot[col];
    }
  };

  const filas = useMemo(() => {
    const filtradas = ots.filter(
      (ot) =>
        (!misAsignados ||
          ot.responsableId === usuarioActual.id ||
          (ot.colaboradores ?? []).includes(usuarioActual.id)) &&
        (prioridad === "todas" || ot.prioridad === prioridad) &&
        (responsable === "todos" || ot.responsableId === responsable) &&
        (cliente === "todos" || ot.cliente === cliente) &&
        (texto.trim() === "" ||
          `${ot.id} ${ot.titulo} ${ot.cliente} ${ot.descripcion}`.toLowerCase().includes(texto.toLowerCase())),
    );
    return [...filtradas].sort((a, b) => {
      const va = valor(a, orden.col, sla);
      const vb = valor(b, orden.col, sla);
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return orden.asc ? cmp : -cmp;
    });
  }, [ots, prioridad, responsable, cliente, texto, orden, sla, misAsignados]);

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
            <span>{responsable === "todos" ? "Responsable" : getUsuario(responsable).nombre}</span>
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
        <button
          onClick={() => setMisAsignados((v) => !v)}
          className={cn(
            "h-9 rounded-md border px-3 text-sm transition-colors",
            misAsignados
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border hover:bg-muted",
          )}
        >
          Mis asignados
        </button>
        <span className="text-xs text-muted-foreground sm:ml-auto">
          {filas.length} de {ots.length} OT
        </span>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card card-elev">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              {columnas.map((c) => (
                <th key={c.key} className={cn("px-4 py-2.5 font-medium", c.alineado)}>
                  <button
                    onClick={() =>
                      setOrden((o) => (o.col === c.key ? { col: c.key, asc: !o.asc } : { col: c.key, asc: true }))
                    }
                    className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                  >
                    {c.label}
                    {orden.col === c.key &&
                      (orden.asc ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((ot) => (
              <tr
                key={ot.id}
                onClick={() => abrirOT(ot.id)}
                className="cursor-pointer border-b border-border/70 transition-colors last:border-0 hover:bg-accent/45"
              >
                <td className="px-4 py-3 font-mono text-xs">{ot.id}</td>
                <td className="max-w-72 truncate px-4 py-3">{ot.titulo}</td>
                <td className="px-4 py-3">{ot.cliente}</td>
                <td className="px-4 py-3">
                  <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {ot.estado}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <PrioridadBadge prioridad={ot.prioridad} />
                </td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2">
                    <AvataresEquipo responsableId={ot.responsableId} colaboradores={ot.colaboradores} />
                    <span className="text-xs">{getUsuario(ot.responsableId).nombre}</span>
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {formatoFecha(ot.fechaIngreso)}
                </td>
                <td
                  className={cn(
                    "px-4 py-3 font-mono text-xs",
                    nivelSla(ot, sla) === "Vencida" ? "font-semibold text-alta" : "text-muted-foreground",
                  )}
                >
                  {formatoFecha(ot.fechaEstimada)}
                </td>
                <td className="px-4 py-3" title={vencimientoSla(ot, sla).toLocaleString("es-CL")}>
                  <SlaBadge nivel={nivelSla(ot, sla)} />
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs">
                  {ot.horas.reduce((s, h) => s + h.horas, 0)}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {ot.cotizacionId ?? "—"}
                </td>
              </tr>
            ))}
            {filas.length === 0 && (
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
    </div>
  );
}
