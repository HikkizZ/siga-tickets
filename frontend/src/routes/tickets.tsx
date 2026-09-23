import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Handshake, Inbox, Mail, Phone, Plus, Search, Users, X } from "lucide-react";
import { PrioridadBadge, SlaBadge } from "@/components/Prioridad";
import { TicketDetail } from "@/components/TicketDetail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatoFecha } from "@/lib/mock-data";
import { ESTADOS_TICKET, PRIORIDADES, etiquetaCanalTicket, etiquetaEstadoTicket, etiquetaPrioridad, type CanalTicket } from "@/lib/labels";
import { useTickets } from "@/hooks/useTickets";
import type { TicketsFiltros } from "@/lib/api/tickets";
import { useOTStore } from "@/lib/ot-store";
import { useUsuarios } from "@/hooks/useUsuarios";
import { useDebounced } from "@/hooks/useDebounced";

export const Route = createFileRoute("/tickets")({
  head: () => ({
    meta: [
      { title: "Tickets · Mesa de ayuda · Taller OT" },
      {
        name: "description",
        content:
          "Bandeja de tickets de la mesa de ayuda con estado, canal, prioridad, SLA y conversión a orden de trabajo.",
      },
      { property: "og:title", content: "Tickets · Mesa de ayuda · Taller OT" },
      {
        property: "og:description",
        content: "Responde a los clientes, deja notas internas o conviértelas en órdenes de trabajo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Tickets,
});

const TODOS = "__todos__";
const PER_PAGE = 25;

// Todos los canales (a diferencia del formulario de creación, el filtro sí muestra los 5 —
// puede haber tickets del portal o de correo de fases futuras).
const CANALES_FILTRO: readonly CanalTicket[] = ["portal", "correo", "telefono", "presencial", "interno"];
const iconosCanal: Record<CanalTicket, typeof Mail> = {
  portal: Inbox,
  correo: Mail,
  telefono: Phone,
  presencial: Handshake,
  interno: Users,
};

function CanalBadgeReal({ canal }: { canal: CanalTicket }) {
  const Icono = iconosCanal[canal];
  return (
    <span className="inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
      <Icono className="size-3" />
      {etiquetaCanalTicket(canal)}
    </span>
  );
}

function Filtro<T extends string>({
  valor,
  onChange,
  opciones,
  etiqueta,
  etiquetaOpcion,
}: {
  valor: string;
  onChange: (v: string) => void;
  opciones: readonly T[];
  etiqueta: string;
  etiquetaOpcion: (o: T) => string;
}) {
  return (
    <Select value={valor} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-full text-xs sm:w-44">
        <span className={cn(valor === TODOS && "text-muted-foreground")}>
          {valor === TODOS ? etiqueta : etiquetaOpcion(valor as T)}
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TODOS}>{etiqueta}</SelectItem>
        {opciones.map((o) => (
          <SelectItem key={o} value={o}>
            {etiquetaOpcion(o)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Tickets() {
  const { ticketAbierto, abrirTicket } = useOTStore();
  const { data: usuarios } = useUsuarios();
  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState(TODOS);
  const [canal, setCanal] = useState(TODOS);
  const [prioridad, setPrioridad] = useState(TODOS);
  const [responsable, setResponsable] = useState(TODOS);
  const [misAsignados, setMisAsignados] = useState(false);
  const [sinAsignar, setSinAsignar] = useState(false);
  const [page, setPage] = useState(1);

  const textoDebounced = useDebounced(texto);

  const hayFiltros =
    texto !== "" ||
    misAsignados ||
    sinAsignar ||
    [estado, canal, prioridad, responsable].some((f) => f !== TODOS);

  useEffect(() => {
    setPage(1);
  }, [textoDebounced, estado, canal, prioridad, responsable, misAsignados, sinAsignar]);

  const filtros: TicketsFiltros = {
    page,
    perPage: PER_PAGE,
    q: textoDebounced.trim() || undefined,
    estado: estado === TODOS ? undefined : (estado as TicketsFiltros["estado"]),
    canal: canal === TODOS ? undefined : (canal as TicketsFiltros["canal"]),
    prioridad: prioridad === TODOS ? undefined : (prioridad as TicketsFiltros["prioridad"]),
    responsable: responsable === TODOS ? undefined : responsable,
    mios: misAsignados || undefined,
    sinAsignar: sinAsignar || undefined,
  };
  const { data, isLoading } = useTickets(filtros);
  const visibles = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Inbox className="size-5 text-primary" /> Tickets
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Solicitudes de clientes desde el portal, correo o teléfono. Responde, deja notas internas o
            conviértelas en OT.
          </p>
        </div>
        <Button asChild className="ml-auto h-10">
          <Link to="/nuevo-ticket">
            <Plus className="size-4" /> Nuevo ticket
          </Link>
        </Button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por ticket, asunto o solicitante…"
            className="h-9 pl-9 text-sm"
          />
        </div>
        <Filtro valor={estado} onChange={setEstado} opciones={ESTADOS_TICKET} etiqueta="Todos los estados" etiquetaOpcion={etiquetaEstadoTicket} />
        <Filtro valor={canal} onChange={setCanal} opciones={CANALES_FILTRO} etiqueta="Todos los canales" etiquetaOpcion={etiquetaCanalTicket} />
        <Filtro valor={prioridad} onChange={setPrioridad} opciones={PRIORIDADES} etiqueta="Toda prioridad" etiquetaOpcion={etiquetaPrioridad} />
        <Select value={responsable} onValueChange={setResponsable}>
          <SelectTrigger className="h-9 w-full text-xs sm:w-48">
            <span className={cn(responsable === TODOS && "text-muted-foreground")}>
              {responsable === TODOS ? "Todo responsable" : (usuarios?.find((u) => u.id === responsable)?.nombre ?? "Responsable")}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todo responsable</SelectItem>
            {(usuarios ?? []).map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={misAsignados ? "default" : "outline"}
          className="h-9 text-xs"
          onClick={() => setMisAsignados((v) => !v)}
        >
          Mis asignados
        </Button>
        <Button
          variant={sinAsignar ? "default" : "outline"}
          className="h-9 text-xs"
          onClick={() => setSinAsignar((v) => !v)}
        >
          Sin asignar
        </Button>
        {hayFiltros && (
          <Button
            variant="outline"
            className="h-9"
            onClick={() => {
              setTexto("");
              setEstado(TODOS);
              setCanal(TODOS);
              setPrioridad(TODOS);
              setResponsable(TODOS);
              setMisAsignados(false);
              setSinAsignar(false);
            }}
          >
            <X className="size-4" /> Limpiar
          </Button>
        )}
        <span className="text-xs text-muted-foreground sm:ml-auto">
          {total} tickets · página {page} de {totalPaginas}
        </span>
      </div>

      {isLoading ? (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-14 text-center">
          <p className="text-sm text-muted-foreground">Cargando…</p>
        </div>
      ) : visibles.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-14 text-center">
          <Inbox className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">Ningún ticket coincide con los filtros</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Ajusta la búsqueda o limpia los filtros para ver toda la bandeja.
          </p>
        </div>
      ) : (
        <ul className="mt-5 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card card-elev">
          {visibles.map((t) => (
            <li
              key={t.id}
              className={cn(
                "cursor-pointer px-5 py-4 transition-colors hover:bg-accent/40",
                t.estado === "nuevo" && "border-l-2 border-l-primary bg-primary/5",
              )}
              onClick={() => abrirTicket(t.id)}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] text-muted-foreground">{t.numero}</span>
                <h2 className={cn("text-sm", t.estado === "nuevo" ? "font-semibold" : "font-medium")}>{t.asunto}</h2>
                <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {etiquetaEstadoTicket(t.estado)}
                </span>
                <PrioridadBadge prioridad={t.prioridad} />
                <CanalBadgeReal canal={t.canal} />
                <SlaBadge nivel={t.slaEstado} />
                <span className="ml-auto flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {t.responsable ? t.responsable.nombre : "Sin asignar"}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">{formatoFecha(t.fechaIngreso)}</span>
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {t.solicitanteNombre ?? "—"}
                {t.cliente ? ` · ${t.cliente.nombre}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}

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

      <TicketDetail ticketId={ticketAbierto} onClose={() => abrirTicket(null)} />
    </div>
  );
}
