import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AlertCircle, CalendarClock, Check, Search, Send, User, Wrench } from "lucide-react";
import { PortalLayout } from "@/components/PortalLayout";
import { EstadoTicketBadge } from "@/components/TicketBadges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatoFecha, getUsuario } from "@/lib/mock-data";
import { useOTStore } from "@/lib/ot-store";

export const Route = createFileRoute("/mesa-de-ayuda/seguimiento")({
  head: () => ({
    meta: [
      { title: "Seguimiento de ticket · Mesa de ayuda · Taller OT" },
      {
        name: "description",
        content:
          "Consulta el estado de tu ticket de soporte con tu número de ticket y correo, revisa las respuestas del equipo y responde.",
      },
      { property: "og:title", content: "Seguimiento de ticket · Taller OT" },
      {
        property: "og:description",
        content: "Revisa el avance de tu solicitud y del trabajo asociado en Taller OT.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Seguimiento,
});

function Seguimiento() {
  const { tickets, ots, responderComoCliente } = useOTStore();
  const [numero, setNumero] = useState("");
  const [correo, setCorreo] = useState("");
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [respuesta, setRespuesta] = useState("");
  const [enviado, setEnviado] = useState(false);

  const ticket = tickets.find((t) => t.id === ticketId) ?? null;
  const ot = ticket ? ots.find((o) => ticket.otIds.includes(o.id)) : undefined;
  const publicos = ticket?.mensajes.filter((m) => !m.interna) ?? [];

  if (!ticket) {
    return (
      <PortalLayout accion={{ to: "/mesa-de-ayuda", label: "Crear ticket" }}>
        <h1 className="text-2xl font-semibold tracking-tight">Seguimiento de tu ticket</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ingresa el número que te enviamos por correo y tu dirección de correo.
        </p>
        <form
          className="mt-6 space-y-5 rounded-xl border border-border bg-card p-5 card-elev sm:p-6"
          onSubmit={(e) => {
            e.preventDefault();
            const encontrado = tickets.find(
              (t) =>
                t.id.toLowerCase() === numero.trim().toLowerCase() &&
                t.solicitanteEmail.toLowerCase() === correo.trim().toLowerCase(),
            );
            if (!encontrado) {
              setError(
                "No encontramos un ticket con ese número y correo. Revisa los datos del correo de confirmación.",
              );
              return;
            }
            setError("");
            setTicketId(encontrado.id);
          }}
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="numero" className="text-xs">
                Número de ticket
              </Label>
              <Input
                id="numero"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                placeholder="TK-0001"
                className="h-10 font-mono"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="correo" className="text-xs">
                Correo
              </Label>
              <Input
                id="correo"
                type="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                className="h-10"
                required
              />
            </div>
          </div>
          {error && (
            <p className="flex items-start gap-2 rounded-lg border border-alta/25 bg-alta-suave px-3 py-2 text-sm text-alta">
              <AlertCircle className="mt-0.5 size-4 shrink-0" /> {error}
            </p>
          )}
          <Button type="submit" className="h-11 w-full sm:w-auto">
            <Search className="size-4" /> Ver mi ticket
          </Button>
        </form>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout accion={{ to: "/mesa-de-ayuda", label: "Crear ticket" }}>
      <button
        onClick={() => {
          setTicketId(null);
          setRespuesta("");
          setEnviado(false);
        }}
        className="text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Consultar otro ticket
      </button>

      <div className="mt-3 rounded-xl border border-border bg-card p-5 card-elev sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{ticket.id}</span>
          <EstadoTicketBadge estado={ticket.estado} />
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">{ticket.fecha}</span>
        </div>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">{ticket.asunto}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{ticket.descripcion}</p>
      </div>

      {ot && (
        <div className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-5 card-elev sm:p-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Wrench className="size-4 text-primary" /> Estado de tu solicitud
          </h2>
          <dl className="mt-3 grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Etapa</dt>
              <dd className="mt-1 text-sm font-medium">
                {ot.estado === "Facturado" ? "Terminado" : ot.estado}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Fecha estimada
              </dt>
              <dd className="mt-1 flex items-center gap-1.5 text-sm">
                <CalendarClock className="size-3.5 text-muted-foreground" />
                {formatoFecha(ot.fechaEstimada)}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Responsable</dt>
              <dd className="mt-1 text-sm">{getUsuario(ot.responsableId).nombre}</dd>
            </div>
          </dl>
        </div>
      )}

      <section className="mt-4 rounded-xl border border-border bg-card p-5 card-elev sm:p-6">
        <h2 className="text-sm font-semibold">Conversación</h2>
        <ul className="mt-3 space-y-3">
          {publicos.map((m) => (
            <li
              key={m.id}
              className={cn(
                "rounded-lg border p-3",
                m.autor === "cliente" ? "border-border bg-secondary/50" : "border-primary/20 bg-primary/5",
              )}
            >
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {m.autor === "cliente" ? m.nombre : `${m.nombre} · Taller OT`}
                </span>
                <span className="font-mono">{m.fecha}</span>
              </p>
              <p className="mt-1 whitespace-pre-line text-sm">{m.texto}</p>
            </li>
          ))}
        </ul>

        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!respuesta.trim()) return;
            responderComoCliente(ticket.id, respuesta.trim());
            setRespuesta("");
            setEnviado(true);
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
            <Button type="submit" className="h-10">
              <Send className="size-4" /> Enviar respuesta
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
