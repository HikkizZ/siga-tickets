import { useState } from "react";
import {
  CalendarClock,
  ChevronDown,
  Download,
  File as FileGenericIcon,
  Link2,
  MessageSquare,
  Paperclip,
  Plus,
  Share2,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { formatoFechaHora } from "@/lib/mock-data";
import { etiquetaEstadoTicket, etiquetaPrioridad, type EstadoTicket as EstadoTicketBackend, type Prioridad as PrioridadBackend } from "@/lib/labels";
import { descargarAdjunto } from "@/lib/api/ots";
import type { EventoTicket, TicketDetalle } from "@/lib/api/tickets";

function formatoBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Texto legible por tipo de evento del ticket (docs/api.md, "Eventos de auditoría de un
 * ticket") — mismo criterio que textoEvento() de OTDetail.tsx, sin cambios respecto a la Fase 3,
 * solo reubicado junto al historial que consume. */
function textoEventoTicket(e: EventoTicket): string {
  const p = e.payload as Record<string, unknown>;
  switch (e.tipo) {
    case "creado":
      return "creó el ticket";
    case "estado_cambiado":
      return `cambió el estado a ${etiquetaEstadoTicket(String(p["a"]) as EstadoTicketBackend)}`;
    case "prioridad_cambiada":
      return `cambió la prioridad a ${etiquetaPrioridad(String(p["a"]) as PrioridadBackend)}`;
    case "ticket_editado":
      return "editó datos del ticket";
    case "tomado":
      return "tomó el ticket";
    case "derivado":
      return `derivó el ticket${typeof p["motivo"] === "string" ? ` — motivo: ${p["motivo"]}` : ""}`;
    case "respuesta_cliente":
      return "respondió al cliente";
    case "nota_interna":
      return "agregó una nota interna";
    case "adjunto_agregado":
      return "agregó un adjunto";
    case "vinculado_ot":
      return `vinculó la OT ${p["otNumero"]}${p["esOrigen"] ? " (conversión)" : ""}`;
    case "ot_desvinculada":
      return `desvinculó la OT ${p["otNumero"]}`;
    default:
      return e.tipo.replace(/_/g, " ");
  }
}

const iconoPorTipoEventoTicket = (tipo: string) => {
  if (tipo === "creado") return Plus;
  if (tipo === "derivado") return Share2;
  if (tipo === "tomado") return UserCheck;
  if (tipo.includes("estado") || tipo.includes("prioridad")) return CalendarClock;
  if (tipo === "respuesta_cliente" || tipo === "nota_interna") return MessageSquare;
  if (tipo.includes("adjunto")) return Paperclip;
  if (tipo.includes("_ot")) return Link2;
  return Plus;
};

/** Adjuntos sueltos + historial de actividad: de consulta ocasional, no compiten por espacio con
 * la conversación (pedido del encargo) — colapsados por defecto, al final del detalle. Sin
 * cambios de datos respecto a la Fase 3, solo reubicados y colapsados. */
export function TicketExtras({ ticket }: { ticket: TicketDetalle }) {
  const [abiertoAdjuntos, setAbiertoAdjuntos] = useState(false);
  const [abiertoHistorial, setAbiertoHistorial] = useState(false);

  const alDescargar = async (adjuntoId: string, nombre: string) => {
    try {
      await descargarAdjunto(adjuntoId, nombre);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo descargar el adjunto.");
    }
  };

  return (
    <div className="space-y-2 border-t border-border pt-4">
      <Collapsible open={abiertoAdjuntos} onOpenChange={setAbiertoAdjuntos}>
        <CollapsibleTrigger asChild>
          <button type="button" className="flex w-full items-center justify-between rounded-md px-1 py-1.5 text-sm font-semibold transition-colors hover:text-primary">
            <span className="flex items-center gap-1.5">
              <Paperclip className="size-4" /> Adjuntos del ticket
              {ticket.adjuntos.length > 0 && <span className="text-xs font-normal text-muted-foreground">({ticket.adjuntos.length})</span>}
            </span>
            <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", abiertoAdjuntos && "rotate-180")} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          {ticket.adjuntos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin adjuntos sueltos (todos están asociados a un mensaje, o no hay ninguno).</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {ticket.adjuntos.map((a) => (
                <li key={a.id} className="flex items-center gap-3 rounded-md border border-border bg-card p-2.5">
                  <span className="flex size-10 items-center justify-center rounded bg-muted text-muted-foreground">
                    <FileGenericIcon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{a.nombre}</p>
                    <p className="text-[11px] text-muted-foreground">{formatoBytes(a.tamanoBytes)}</p>
                  </div>
                  <Button size="icon" variant="ghost" className="size-8 shrink-0 text-muted-foreground hover:text-foreground" aria-label={`Descargar ${a.nombre}`} onClick={() => alDescargar(a.id, a.nombre)}>
                    <Download className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CollapsibleContent>
      </Collapsible>

      <Collapsible open={abiertoHistorial} onOpenChange={setAbiertoHistorial}>
        <CollapsibleTrigger asChild>
          <button type="button" className="flex w-full items-center justify-between rounded-md px-1 py-1.5 text-sm font-semibold transition-colors hover:text-primary">
            Historial de actividad
            <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", abiertoHistorial && "rotate-180")} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          {ticket.eventos.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin eventos registrados todavía.</p>
          ) : (
            <ol className="space-y-4 border-l border-border pl-5">
              {ticket.eventos.map((e) => {
                const Icono = iconoPorTipoEventoTicket(e.tipo);
                return (
                  <li key={e.id} className="relative">
                    <span className="absolute -left-[30px] flex size-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
                      <Icono className="size-3" />
                    </span>
                    <p className="text-sm">
                      <span className="font-medium">{e.actor.nombre}</span> {textoEventoTicket(e)}
                    </p>
                    <p className="font-mono text-[11px] text-muted-foreground">{formatoFechaHora(new Date(e.ocurridoEn))}</p>
                  </li>
                );
              })}
            </ol>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
