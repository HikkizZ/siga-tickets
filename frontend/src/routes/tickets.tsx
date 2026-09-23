import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Inbox, Link2, Paperclip, Plus, Search, X } from "lucide-react";
import { AvataresEquipo, PrioridadBadge } from "@/components/Prioridad";
import { CanalBadge, EstadoTicketBadge, SlaRespuestaBadge } from "@/components/TicketBadges";
import { TicketDetail } from "@/components/TicketDetail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  CANALES_TICKET,
  ESTADOS_TICKET,
  getUsuario,
  nivelPrimeraRespuesta,
  usuarioActual,
  usuarios,
} from "@/lib/mock-data";
import { useOTStore } from "@/lib/ot-store";

export const Route = createFileRoute("/tickets")({
  head: () => ({
    meta: [
      { title: "Tickets · Mesa de ayuda · Taller OT" },
      {
        name: "description",
        content:
          "Bandeja de tickets de la mesa de ayuda con estado, canal, prioridad, SLA de primera respuesta y conversión a orden de trabajo.",
      },
      { property: "og:title", content: "Tickets · Mesa de ayuda · Taller OT" },
      {
        property: "og:description",
        content: "Responde a los clientes, deja notas internas y convierte tickets en órdenes de trabajo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Tickets,
});

const TODOS = "__todos__";

function Filtro({
  valor,
  onChange,
  opciones,
  etiqueta,
}: {
  valor: string;
  onChange: (v: string) => void;
  opciones: readonly string[];
  etiqueta: string;
}) {
  return (
    <Select value={valor} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-full text-xs sm:w-44">
        <span className={cn(valor === TODOS && "text-muted-foreground")}>
          {valor === TODOS ? etiqueta : valor}
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TODOS}>{etiqueta}</SelectItem>
        {opciones.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Tickets() {
  const { tickets, slaRespuesta, abrirOT, ticketAbierto, abrirTicket } = useOTStore();
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState(TODOS);
  const [canal, setCanal] = useState(TODOS);
  const [prioridad, setPrioridad] = useState(TODOS);
  const [responsable, setResponsable] = useState(TODOS);
  const [misAsignados, setMisAsignados] = useState(false);

  const hayFiltros =
    busqueda !== "" ||
    misAsignados ||
    [estado, canal, prioridad, responsable].some((f) => f !== TODOS);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return tickets.filter((t) => {
      if (misAsignados && t.responsableId !== usuarioActual.id) return false;
      if (estado !== TODOS && t.estado !== estado) return false;
      if (canal !== TODOS && t.canal !== canal) return false;
      if (prioridad !== TODOS && t.prioridad !== prioridad) return false;
      if (responsable !== TODOS && (t.responsableId ?? "") !== responsable) return false;
      if (!q) return true;
      return [t.id, t.asunto, t.solicitanteNombre, t.solicitanteEmail, t.empresa ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [tickets, busqueda, estado, canal, prioridad, responsable, misAsignados]);

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
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por ticket, asunto o solicitante…"
            className="h-9 pl-9 text-sm"
          />
        </div>
        <Filtro valor={estado} onChange={setEstado} opciones={ESTADOS_TICKET} etiqueta="Todos los estados" />
        <Filtro valor={canal} onChange={setCanal} opciones={CANALES_TICKET} etiqueta="Todos los canales" />
        <Filtro
          valor={prioridad}
          onChange={setPrioridad}
          opciones={["Alta", "Media", "Baja"]}
          etiqueta="Toda prioridad"
        />
        <Select value={responsable} onValueChange={setResponsable}>
          <SelectTrigger className="h-9 w-full text-xs sm:w-48">
            <span className={cn(responsable === TODOS && "text-muted-foreground")}>
              {responsable === TODOS ? "Todo responsable" : getUsuario(responsable).nombre}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todo responsable</SelectItem>
            {usuarios.map((u) => (
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
        {hayFiltros && (
          <Button
            variant="outline"
            className="h-9"
            onClick={() => {
              setBusqueda("");
              setEstado(TODOS);
              setCanal(TODOS);
              setPrioridad(TODOS);
              setResponsable(TODOS);
              setMisAsignados(false);
            }}
          >
            <X className="size-4" /> Limpiar
          </Button>
        )}
      </div>

      {visibles.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-14 text-center">
          <Inbox className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">Ningún ticket coincide con los filtros</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Ajusta la búsqueda o limpia los filtros para ver toda la bandeja.
          </p>
        </div>
      ) : (
        <ul className="mt-5 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card card-elev">
          {visibles.map((t) => {
            const nivel = nivelPrimeraRespuesta(t, slaRespuesta);
            return (
              <li
                key={t.id}
                className={cn(
                  "cursor-pointer px-5 py-4 transition-colors hover:bg-accent/40",
                  t.estado === "Nuevo" && "border-l-2 border-l-primary bg-primary/5",
                )}
                onClick={() => abrirTicket(t.id)}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-muted-foreground">{t.id}</span>
                  <h2 className={cn("text-sm", t.estado === "Nuevo" ? "font-semibold" : "font-medium")}>
                    {t.asunto}
                  </h2>
                  <EstadoTicketBadge estado={t.estado} />
                  <PrioridadBadge prioridad={t.prioridad} />
                  <CanalBadge canal={t.canal} />
                  {nivel && <SlaRespuestaBadge nivel={nivel} />}
                  <span className="ml-auto flex items-center gap-3">
                    {t.responsableId && <AvataresEquipo responsableId={t.responsableId} />}
                    <span className="font-mono text-[11px] text-muted-foreground">{t.fecha}</span>
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t.solicitanteNombre} · {t.solicitanteEmail}
                  {t.empresa ? ` · ${t.empresa}` : ""}
                </p>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{t.descripcion}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {t.adjuntos.map((a) => (
                    <span
                      key={a}
                      className="inline-flex items-center gap-1.5 rounded border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                    >
                      <Paperclip className="size-3" />
                      {a}
                    </span>
                  ))}
                  {t.otIds.map((id) => (
                    <button
                      key={id}
                      onClick={(e) => {
                        e.stopPropagation();
                        abrirOT(id);
                      }}
                      className="inline-flex items-center gap-1 rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-secondary-foreground transition-colors hover:border-primary/40"
                    >
                      <Link2 className="size-3" /> {id}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <TicketDetail ticketId={ticketAbierto} onClose={() => abrirTicket(null)} />
    </div>
  );
}
