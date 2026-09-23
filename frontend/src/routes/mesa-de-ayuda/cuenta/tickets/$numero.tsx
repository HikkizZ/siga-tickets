import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Check, CalendarClock, Paperclip, Send, User, Wrench } from "lucide-react";
import { PortalLayout } from "@/components/PortalLayout";
import { EstadoTicketBadge } from "@/components/TicketBadges";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatoFecha } from "@/lib/mock-data";
import { ApiError } from "@/lib/api/client";
import { etiquetaEstadoOt } from "@/lib/labels";
import { clearCuentaToken } from "@/lib/portal/cuentaToken";
import { useCuentaSesion, useDetalleTicketCuenta, useLimpiarCacheCuenta, useResponderTicketCuenta } from "@/hooks/usePortalCuenta";

export const Route = createFileRoute("/mesa-de-ayuda/cuenta/tickets/$numero")({
  head: () => ({
    meta: [
      { title: "Ticket · Mis tickets · Taller OT" },
      { name: "description", content: "Revisa el estado y la conversación de tu ticket de soporte." },
    ],
  }),
  component: DetalleTicketCuenta,
});

// Reutiliza la MISMA estructura visual que seguimiento.tsx (portal por ticket, sin cuenta) para
// mostrar la conversación y responder — ver docs/frontend-diseno.md, Fase D. Solo cambian los
// datos: acá vienen de GET/POST /publico/cuentas/tickets/:numero(/mensajes) con el token de
// cuenta, en vez del token de portal por ticket.
function DetalleTicketCuenta() {
  const navigate = useNavigate();
  const { numero } = Route.useParams();
  const { cuentaToken, revisado } = useCuentaSesion();
  const limpiarCache = useLimpiarCacheCuenta();
  const [respuesta, setRespuesta] = useState("");
  const [archivosRespuesta, setArchivosRespuesta] = useState<File[]>([]);
  const [enviado, setEnviado] = useState(false);
  const inputArchivoRespuestaRef = useRef<HTMLInputElement>(null);

  const responder = useResponderTicketCuenta();
  const ticketQuery = useDetalleTicketCuenta(cuentaToken, numero);

  // Token de cuenta inválido o expirado: mismo criterio que mis-tickets.tsx.
  useEffect(() => {
    if (!ticketQuery.isError || !cuentaToken) return;
    const error = ticketQuery.error;
    if (error instanceof ApiError && error.status === 401) {
      clearCuentaToken();
      limpiarCache();
      void navigate({ to: "/mesa-de-ayuda/cuenta/login", replace: true });
    }
  }, [ticketQuery.isError, ticketQuery.error, cuentaToken, limpiarCache, navigate]);

  if (!revisado || !cuentaToken) {
    return (
      <PortalLayout>
        <p className="text-sm text-muted-foreground">Cargando tu cuenta…</p>
      </PortalLayout>
    );
  }

  if (!ticketQuery.data) {
    return (
      <PortalLayout accion={{ to: "/mesa-de-ayuda/cuenta/mis-tickets", label: "Mis tickets" }}>
        {ticketQuery.isError ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center card-elev">
            <p className="text-sm text-muted-foreground">No pudimos cargar este ticket.</p>
            <Button asChild variant="outline" className="mt-4 h-10">
              <Link to="/mesa-de-ayuda/cuenta/mis-tickets">Volver a mis tickets</Link>
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Cargando tu ticket…</p>
        )}
      </PortalLayout>
    );
  }

  const ticket = ticketQuery.data;

  return (
    <PortalLayout accion={{ to: "/mesa-de-ayuda/cuenta/mis-tickets", label: "Mis tickets" }}>
      <Link
        to="/mesa-de-ayuda/cuenta/mis-tickets"
        className="text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Volver a mis tickets
      </Link>

      <div className="mt-3 rounded-xl border border-border bg-card p-5 card-elev sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{ticket.numero}</span>
          <EstadoTicketBadge estado={ticket.estado} />
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">
            {formatoFecha(ticket.fechaIngreso)}
          </span>
        </div>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">{ticket.asunto}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{ticket.descripcion}</p>
      </div>

      {ticket.ot && (
        <div className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-5 card-elev sm:p-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Wrench className="size-4 text-primary" /> Estado de tu solicitud
          </h2>
          <dl className="mt-3 grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Etapa</dt>
              <dd className="mt-1 text-sm font-medium">{etiquetaEstadoOt(ticket.ot.estado)}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Fecha estimada</dt>
              <dd className="mt-1 flex items-center gap-1.5 text-sm">
                <CalendarClock className="size-3.5 text-muted-foreground" />
                {ticket.ot.fechaEstimadaTermino ? formatoFecha(ticket.ot.fechaEstimadaTermino) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Responsable</dt>
              <dd className="mt-1 text-sm">{ticket.ot.responsableNombre}</dd>
            </div>
          </dl>
        </div>
      )}

      <section className="mt-4 rounded-xl border border-border bg-card p-5 card-elev sm:p-6">
        <h2 className="text-sm font-semibold">Conversación</h2>
        <ul className="mt-3 space-y-3">
          {ticket.mensajes.map((m) => (
            <li
              key={m.id}
              className={cn(
                "rounded-lg border p-3",
                m.tipo === "cliente" ? "border-border bg-secondary/50" : "border-primary/20 bg-primary/5",
              )}
            >
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{m.tipo === "cliente" ? "Tú" : "Taller OT"}</span>
                <span className="font-mono">{formatoFecha(m.creadoEn)}</span>
              </p>
              <p className="mt-1 whitespace-pre-line text-sm">{m.cuerpo}</p>
            </li>
          ))}
          {ticket.mensajes.length === 0 && <li className="text-sm text-muted-foreground">Sin mensajes todavía.</li>}
        </ul>

        <form
          className="mt-4 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!respuesta.trim() || !cuentaToken) return;
            try {
              await responder.mutateAsync({
                cuentaToken,
                numero,
                cuerpo: respuesta.trim(),
                ...(archivosRespuesta.length > 0 ? { archivos: archivosRespuesta } : {}),
              });
              setRespuesta("");
              setArchivosRespuesta([]);
              setEnviado(true);
              await ticketQuery.refetch();
            } catch {
              // El toast de error ya lo muestra useResponderTicketCuenta (onError); acá solo se
              // evita que la promesa rechazada de mutateAsync quede sin capturar en la consola.
            }
          }}
        >
          <Label className="flex items-center gap-1.5 text-xs">
            <User className="size-3.5" /> Tu respuesta
          </Label>
          <Textarea
            value={respuesta}
            onChange={(e) => setRespuesta(e.target.value)}
            placeholder="Agrega información o responde al equipo…"
            className="min-h-24 text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputArchivoRespuestaRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  setArchivosRespuesta((prev) => [...prev, ...Array.from(e.target.files ?? [])]);
                  e.target.value = "";
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => inputArchivoRespuestaRef.current?.click()}
            >
              <Paperclip className="size-4" /> Adjuntar
            </Button>
            {archivosRespuesta.map((a, i) => (
              <span
                key={`${a.name}-${i}`}
                className="inline-flex items-center gap-1.5 rounded border border-border bg-muted px-2 py-1 text-[11px] text-muted-foreground"
              >
                <Paperclip className="size-3" />
                {a.name}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" className="h-10" disabled={responder.isPending}>
              <Send className="size-4" /> {responder.isPending ? "Enviando…" : "Enviar respuesta"}
            </Button>
            {enviado && (
              <span className="flex items-center gap-1.5 text-xs text-baja">
                <Check className="size-3.5" /> Enviamos tu respuesta al equipo.
              </span>
            )}
          </div>
        </form>
      </section>
    </PortalLayout>
  );
}
