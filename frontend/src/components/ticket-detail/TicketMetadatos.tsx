import { useState } from "react";
import { ChevronDown, GitMerge, Link2, Share2, UserCheck, Wrench } from "lucide-react";
import { Avatar, SlaBadge } from "@/components/Prioridad";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn, inicialesDeNombre } from "@/lib/utils";
import { formatoFechaHora } from "@/lib/mock-data";
import type { TicketDetalle } from "@/lib/api/tickets";
import type { TramoResponsable } from "@/lib/api/ots";
import { usePrioridades } from "@/hooks/usePrioridades";
import { useEstadosTicket } from "@/hooks/useEstadosTicket";
import {
  useActualizarTicket,
  useCambiarEstadoTicket,
  useDesvincularOtDeTicket,
  useTomarTicket,
} from "@/hooks/useTickets";

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}

function formatoDuracionSeg(seg: number): string {
  const min = Math.round(seg / 60);
  const dias = Math.floor(min / 1440);
  const horas = Math.floor((min % 1440) / 60);
  const resto = min % 60;
  if (dias > 0) return `${dias} d${horas > 0 ? ` ${horas} h` : ""}`;
  if (horas > 0) return `${horas} h${resto > 0 ? ` ${resto} min` : ""}`;
  return `${resto} min`;
}

/** Cadena de responsables real del ticket (GET /tickets/:id → cadenaResponsables, misma forma
 * que OT — TramoResponsable se reutiliza de src/lib/api/ots.ts). Vacía si el ticket nunca se
 * tomó. Sin cambios de lógica respecto al TicketDetail.tsx anterior a Fase E1, solo reubicada. */
function CadenaResponsablesTicket({ tramos }: { tramos: TramoResponsable[] }) {
  if (tramos.length === 0) {
    return <p className="mt-2 text-sm text-muted-foreground">El ticket todavía no se ha tomado.</p>;
  }
  return (
    <ol className="mt-3 space-y-4 border-l border-border pl-5">
      {tramos.map((t, i) => (
        <li key={t.id} className="relative">
          <span
            className={cn(
              "absolute -left-[30px] flex size-5 items-center justify-center rounded-full border",
              t.actual ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-card",
            )}
          >
            {t.actual ? <UserCheck className="size-3" /> : <Share2 className="size-3 text-muted-foreground" />}
          </span>
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <Avatar iniciales={inicialesDeNombre(t.usuario.nombre)} className="size-5 text-[9px]" />
            <span className="font-medium">{t.usuario.nombre}</span>
            {i === 0 && (
              <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Tomó el ticket</span>
            )}
            {t.actual && (
              <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                Responsable actual
              </span>
            )}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            {formatoFechaHora(new Date(t.desde))} → {t.hasta ? formatoFechaHora(new Date(t.hasta)) : "ahora"} · {formatoDuracionSeg(t.duracionSeg)}
          </p>
          {t.motivoEntrada && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t.derivadoPor ? `${t.derivadoPor.nombre} derivó: ` : "Derivó: "}
              {t.motivoEntrada}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

/** Barra lateral de metadatos (Fase E1) — cliente, tema de ayuda, responsable, SLA y estado/
 * prioridad siempre visibles ("de un vistazo"); cadena de responsables completa, solicitante y
 * fechas exactas quedan en un panel plegable ("Más detalles") porque son de consulta ocasional,
 * no porque hayan dejado de estar disponibles. "Convertir en OT" encabeza el panel con peso
 * visual propio; "Vincular a OT existente" queda como acción secundaria más chica, tal como pide
 * el encargo. Ninguna llamada de red nueva: reutiliza los mismos hooks de Fase 3. */
export function TicketMetadatos({
  ticket,
  puedeConvertir,
  onDerivar,
  onConvertir,
  onVincular,
}: {
  ticket: TicketDetalle;
  puedeConvertir: boolean;
  onDerivar: () => void;
  onConvertir: () => void;
  onVincular: () => void;
}) {
  const actualizarTicket = useActualizarTicket();
  const cambiarEstado = useCambiarEstadoTicket();
  const tomarTicket = useTomarTicket();
  const desvincularOt = useDesvincularOtDeTicket();
  const { data: prioridades } = usePrioridades();
  const { data: estadosTicket } = useEstadosTicket();
  const [masDetalles, setMasDetalles] = useState(false);

  const tieneOts = ticket.ots.length > 0;

  return (
    <aside className="min-w-0 space-y-4 lg:w-80 lg:shrink-0">
      {/* Convertir en OT: acción con peso visual propio, primero en el panel para que no se
          pierda entre otros botones (pedido explícito del encargo). */}
      {puedeConvertir && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-primary">
            <Wrench className="size-4" /> Convertir en OT
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            ¿Este ticket requiere trabajo facturable o interno? Conviértelo en una orden de trabajo.
          </p>
          <Button size="sm" className="mt-2.5 h-9 w-full" onClick={onConvertir}>
            <Wrench className="size-4" /> Convertir en OT
          </Button>
          <button type="button" onClick={onVincular} className="mt-2 block w-full text-center text-[11px] text-muted-foreground underline-offset-2 hover:underline">
            o vincular a una OT ya existente
          </button>
        </div>
      )}

      {tieneOts && (
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Link2 className="size-3.5" /> Órdenes de trabajo
          </p>
          <ul className="mt-2 space-y-1.5">
            {ticket.ots.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-xs">
                <span className="font-mono">{o.numero}</span>
                <span className="truncate text-muted-foreground">{o.titulo}</span>
                {o.esOrigen && <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Origen</span>}
                {puedeConvertir && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto h-6 px-2 text-[11px] text-muted-foreground hover:text-alta"
                    disabled={desvincularOt.isPending}
                    onClick={() => desvincularOt.mutate({ id: ticket.id, otId: o.id })}
                  >
                    Desvincular
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!puedeConvertir && (
        <p className="text-[11px] text-muted-foreground">Solo gestión o administración pueden convertir o vincular órdenes de trabajo.</p>
      )}

      {/* Estado / prioridad: editables, siempre visibles a un vistazo. Solo se ofrecen filas
          activas del catálogo (más la actual del ticket, aunque se haya desactivado después). */}
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Estado">
          <Select
            value={ticket.estado.id}
            onValueChange={(v) => cambiarEstado.mutate({ id: ticket.id, estadoId: v })}
          >
            <SelectTrigger className="h-9 w-full text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(estadosTicket ?? [])
                .filter((e) => e.activo || e.id === ticket.estado.id)
                .map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nombre}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </Campo>
        <Campo etiqueta="Prioridad">
          <Select
            value={ticket.prioridad.id}
            onValueChange={(v) => actualizarTicket.mutate({ id: ticket.id, datos: { prioridadId: v } })}
          >
            <SelectTrigger className="h-9 w-full text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(prioridades ?? [])
                .filter((p) => p.activo || p.id === ticket.prioridad.id)
                .map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nombre}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </Campo>
      </div>

      <Campo etiqueta="Responsable actual">
        {ticket.responsable ? (
          <div className="flex items-center gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <Avatar iniciales={inicialesDeNombre(ticket.responsable.nombre)} />
              <span className="truncate">{ticket.responsable.nombre}</span>
            </span>
            <Button size="sm" variant="outline" className="ml-auto h-7 shrink-0 text-xs" onClick={onDerivar}>
              <Share2 className="size-3.5" /> Derivar
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Sin asignar</span>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={tomarTicket.isPending} onClick={() => tomarTicket.mutate(ticket.id)}>
              Tomar
            </Button>
          </div>
        )}
      </Campo>

      <Campo etiqueta="Cliente">{ticket.cliente?.nombre ?? "—"}</Campo>
      <Campo etiqueta="Tema de ayuda">{ticket.temaAyuda?.nombre ?? "—"}</Campo>

      <Campo etiqueta="Vencimiento SLA">
        <div className="flex flex-wrap items-center gap-2">
          <SlaBadge nivel={ticket.slaEstado} />
          {ticket.slaResolucionVenceEn ? (
            <span className={ticket.slaEstado === "vencida" ? "font-medium text-alta" : "text-muted-foreground"}>
              {formatoFechaHora(new Date(ticket.slaResolucionVenceEn))}
            </span>
          ) : (
            <span className="text-muted-foreground">Sin calcular</span>
          )}
        </div>
      </Campo>

      <Collapsible open={masDetalles} onOpenChange={setMasDetalles}>
        <CollapsibleTrigger asChild>
          <button type="button" className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/40">
            Más detalles
            <ChevronDown className={cn("size-4 transition-transform", masDetalles && "rotate-180")} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-3">
          <Campo etiqueta="Solicitante">
            <span className="block">{ticket.solicitanteNombre ?? "—"}</span>
            <span className="text-xs text-muted-foreground">{ticket.solicitanteEmail ?? "—"}</span>
          </Campo>
          <Campo etiqueta="Ingreso">{formatoFechaHora(new Date(ticket.fechaIngreso))}</Campo>
          <Campo etiqueta="Recepcionado por">
            <span className="flex items-center gap-2">
              <Avatar iniciales={inicialesDeNombre(ticket.recepcionadoPor.nombre)} className="size-5 text-[9px]" />
              {ticket.recepcionadoPor.nombre}
            </span>
          </Campo>
          <Campo etiqueta="Primera respuesta">
            {ticket.primeraRespuestaEn ? (
              <span className="text-baja">{formatoFechaHora(new Date(ticket.primeraRespuestaEn))}</span>
            ) : ticket.slaRespuestaVenceEn ? (
              <span>Pendiente · vence {formatoFechaHora(new Date(ticket.slaRespuestaVenceEn))}</span>
            ) : (
              <span className="text-muted-foreground">Pendiente</span>
            )}
          </Campo>
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <GitMerge className="size-3.5" /> Cadena de responsables
            </p>
            <CadenaResponsablesTicket tramos={ticket.cadenaResponsables} />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </aside>
  );
}
