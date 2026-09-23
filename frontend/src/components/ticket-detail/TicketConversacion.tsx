import { useEffect, useRef, useState } from "react";
import { Check, Lock, Paperclip, Send, User } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/Prioridad";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn, inicialesDeNombre } from "@/lib/utils";
import { formatoFechaHora } from "@/lib/mock-data";
import { descargarAdjunto } from "@/lib/api/ots";
import type { MensajeTicket, TicketDetalle } from "@/lib/api/tickets";
import {
  useAgregarMensajeTicket,
  useCambiarEstadoTicket,
  useSubirAdjuntoTicket,
} from "@/hooks/useTickets";

/** Hilo de mensajes + compositor de respuesta, el elemento central del detalle de ticket
 * (Fase E1) — inspirado en cómo osTicket/Zendesk/Freshdesk ponen la conversación primero y el
 * compositor pegado justo debajo del hilo, sin secciones grandes antes. Misma conexión a datos
 * que la Fase 3 (useAgregarMensajeTicket, useSubirAdjuntoTicket, useCambiarEstadoTicket) — este
 * componente solo reorganiza la UI que antes vivía en TicketDetail.tsx. */
export function TicketConversacion({ ticket }: { ticket: TicketDetalle }) {
  const agregarMensaje = useAgregarMensajeTicket();
  const subirAdjunto = useSubirAdjuntoTicket();
  const cambiarEstado = useCambiarEstadoTicket();

  const [texto, setTexto] = useState("");
  const [interna, setInterna] = useState(false);
  const [adjuntosBorrador, setAdjuntosBorrador] = useState<{ id: string; nombre: string }[]>([]);
  const [subiendoAdjunto, setSubiendoAdjunto] = useState(false);
  const inputArchivoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTexto("");
    setInterna(false);
    setAdjuntosBorrador([]);
  }, [ticket.id]);

  const alSubirArchivos = async (archivos: FileList) => {
    setSubiendoAdjunto(true);
    try {
      const subidos = await Promise.allSettled(
        Array.from(archivos).map((archivo) => subirAdjunto.mutateAsync({ id: ticket.id, archivo })),
      );
      const nuevos = subidos
        .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof subirAdjunto.mutateAsync>>> => r.status === "fulfilled")
        .map((r) => ({ id: r.value.id, nombre: r.value.nombre }));
      setAdjuntosBorrador((prev) => [...prev, ...nuevos]);
    } finally {
      setSubiendoAdjunto(false);
      if (inputArchivoRef.current) inputArchivoRef.current.value = "";
    }
  };

  const alDescargar = async (adjuntoId: string, nombre: string) => {
    try {
      await descargarAdjunto(adjuntoId, nombre);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo descargar el adjunto.");
    }
  };

  return (
    <section className="min-w-0">
      <h3 className="text-sm font-semibold">Conversación</h3>
      <ul className="mt-3 space-y-3">
        {ticket.mensajes.map((m: MensajeTicket) => (
          <li
            key={m.id}
            className={cn(
              "flex gap-3 rounded-lg border p-3",
              m.tipo === "nota_interna"
                ? "border-media/30 bg-media-suave"
                : m.tipo === "cliente"
                  ? "border-border bg-secondary/50"
                  : "border-border bg-card",
            )}
          >
            {m.autor ? (
              <Avatar iniciales={inicialesDeNombre(m.autor.nombre)} />
            ) : (
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <User className="size-3.5" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {m.autor?.nombre ?? m.autorExterno ?? ticket.solicitanteNombre ?? "Cliente"}
                </span>
                <span className="font-mono">{formatoFechaHora(new Date(m.creadoEn))}</span>
                {m.tipo === "nota_interna" && (
                  <span className="inline-flex items-center gap-1 rounded border border-media/30 bg-card px-1.5 py-0.5 text-[10px] font-medium text-media">
                    <Lock className="size-3" /> Interna
                  </span>
                )}
              </p>
              <p className="mt-1 whitespace-pre-line text-sm">{m.cuerpo}</p>
              {m.adjuntos.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {m.adjuntos.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => alDescargar(a.id, a.nombre)}
                      className="inline-flex items-center gap-1.5 rounded border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40"
                    >
                      <Paperclip className="size-3" />
                      {a.nombre}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
        {ticket.mensajes.length === 0 && <li className="text-sm text-muted-foreground">Sin mensajes todavía.</li>}
      </ul>

      <form
        className="mt-4 space-y-3 rounded-lg border border-border bg-card p-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!texto.trim()) return;
          try {
            await agregarMensaje.mutateAsync({
              id: ticket.id,
              tipo: interna ? "nota_interna" : "respuesta_cliente",
              cuerpo: texto.trim(),
              ...(adjuntosBorrador.length > 0 ? { adjuntoIds: adjuntosBorrador.map((a) => a.id) } : {}),
            });
            setTexto("");
            setAdjuntosBorrador([]);
          } catch {
            // El toast de error ya lo muestra useAgregarMensajeTicket (onError); acá solo se evita
            // que la promesa rechazada de mutateAsync quede sin capturar en la consola.
          }
        }}
      >
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant={interna ? "outline" : "default"} className="h-8 text-xs" onClick={() => setInterna(false)}>
            Respuesta al cliente
          </Button>
          <Button type="button" size="sm" variant={interna ? "default" : "outline"} className="h-8 text-xs" onClick={() => setInterna(true)}>
            <Lock className="size-3.5" /> Nota interna
          </Button>
        </div>
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={interna ? "Nota visible solo para el equipo…" : "Escribe la respuesta que recibirá el cliente…"}
          className="min-h-24 text-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputArchivoRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) void alSubirArchivos(e.target.files);
            }}
          />
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" disabled={subiendoAdjunto} onClick={() => inputArchivoRef.current?.click()}>
            <Paperclip className="size-3.5" /> {subiendoAdjunto ? "Subiendo…" : "Adjuntar"}
          </Button>
          {adjuntosBorrador.map((a) => (
            <span key={a.id} className="inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              <Check className="size-3" /> {a.nombre}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" className="h-9" disabled={agregarMensaje.isPending}>
            <Send className="size-4" /> {interna ? "Guardar nota" : "Enviar respuesta"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9"
            onClick={() => cambiarEstado.mutate({ id: ticket.id, estado: "esperando_cliente" })}
          >
            Marcar "Esperando cliente"
          </Button>
        </div>
      </form>
    </section>
  );
}
