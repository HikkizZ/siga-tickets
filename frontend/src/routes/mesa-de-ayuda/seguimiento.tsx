import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, CalendarClock, Check, Paperclip, Search, Send, User, Wrench } from "lucide-react";
import { PortalLayout } from "@/components/PortalLayout";
import { EstadoTicketBadge } from "@/components/TicketBadges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatoFecha } from "@/lib/mock-data";
import { ApiError } from "@/lib/api/client";
import { etiquetaEstadoOt } from "@/lib/labels";
import { clearPortalToken, getPortalToken, setPortalToken } from "@/lib/portal/token";
import {
  useAdjuntarArchivoPublico,
  useLimpiarCachePortal,
  useResponderComoClientePublico,
  useSolicitarSeguimiento,
  useTicketPublico,
} from "@/hooks/usePortal";

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
  // Arranca en null (igual que el render del servidor, que nunca tiene sessionStorage) y solo se
  // lee el token guardado dentro de un efecto, después de montar — mismo patrón que AuthProvider
  // con el JWT interno (src/lib/auth/AuthProvider.tsx). Leerlo directo en el inicializador de
  // useState causaba un mismatch de hidratación real (confirmado en la consola del navegador
  // durante la verificación de esta fase): el servidor siempre renderiza el formulario de
  // búsqueda, y si el cliente ya tenía un token guardado, hidrataba con un árbol distinto.
  const [portalToken, setPortalTokenLocal] = useState<string | null>(null);
  const [numero, setNumero] = useState("");
  const [email, setEmail] = useState("");
  const [errorBusqueda, setErrorBusqueda] = useState("");
  const [respuesta, setRespuesta] = useState("");
  const [archivosRespuesta, setArchivosRespuesta] = useState<File[]>([]);
  const [enviado, setEnviado] = useState(false);
  const inputArchivoRespuestaRef = useRef<HTMLInputElement>(null);
  const inputArchivoSueltoRef = useRef<HTMLInputElement>(null);

  const solicitarSeguimiento = useSolicitarSeguimiento();
  const responderComoCliente = useResponderComoClientePublico();
  const adjuntarArchivo = useAdjuntarArchivoPublico();
  const limpiarCache = useLimpiarCachePortal();
  const ticketQuery = useTicketPublico(portalToken);

  // Lee el token guardado (si hay) recién después de montar en el cliente — ver comentario en la
  // declaración de `portalToken` sobre por qué no se lee en el inicializador de useState.
  useEffect(() => {
    const guardado = getPortalToken();
    if (guardado) setPortalTokenLocal(guardado.token);
  }, []);

  // Token guardado inválido o expirado (401): el backend nunca distingue el motivo (docs/api.md).
  // Se limpia y se vuelve al formulario de búsqueda con un mensaje claro.
  useEffect(() => {
    if (!ticketQuery.isError || !portalToken) return;
    const error = ticketQuery.error;
    if (error instanceof ApiError && error.status === 401) {
      limpiarCache(portalToken);
      clearPortalToken();
      setPortalTokenLocal(null);
      setErrorBusqueda("Tu sesión de seguimiento expiró, vuelve a consultar tu ticket.");
    }
  }, [ticketQuery.isError, ticketQuery.error, portalToken, limpiarCache]);

  const volverABuscar = () => {
    if (portalToken) limpiarCache(portalToken);
    clearPortalToken();
    setPortalTokenLocal(null);
    setRespuesta("");
    setArchivosRespuesta([]);
    setEnviado(false);
  };

  if (!portalToken) {
    return (
      <PortalLayout accion={{ to: "/mesa-de-ayuda", label: "Crear ticket" }}>
        <h1 className="text-2xl font-semibold tracking-tight">Seguimiento de tu ticket</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ingresa el número que te enviamos por correo y tu dirección de correo.
        </p>
        <form
          className="mt-6 space-y-5 rounded-xl border border-border bg-card p-5 card-elev sm:p-6"
          onSubmit={async (e) => {
            e.preventDefault();
            setErrorBusqueda("");
            try {
              const { token } = await solicitarSeguimiento.mutateAsync({
                numero: numero.trim(),
                email: email.trim(),
              });
              setPortalTokenLocal(token);
            } catch (error) {
              // Mismo mensaje genérico tanto si el número no existe como si el correo no
              // coincide — nunca revelar cuál de las dos causas fue (docs/api.md).
              setErrorBusqueda(
                error instanceof ApiError ? error.message : "Ocurrió un error inesperado. Intenta de nuevo.",
              );
            }
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10"
                required
              />
            </div>
          </div>
          {errorBusqueda && (
            <p className="flex items-start gap-2 rounded-lg border border-alta/25 bg-alta-suave px-3 py-2 text-sm text-alta">
              <AlertCircle className="mt-0.5 size-4 shrink-0" /> {errorBusqueda}
            </p>
          )}
          <Button type="submit" className="h-11 w-full sm:w-auto" disabled={solicitarSeguimiento.isPending}>
            <Search className="size-4" /> {solicitarSeguimiento.isPending ? "Buscando…" : "Ver mi ticket"}
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          ¿Tienes una cuenta?{" "}
          <Link to="/mesa-de-ayuda/cuenta/login" className="font-medium text-primary hover:underline">
            Inicia sesión para ver todos tus tickets
          </Link>
        </p>
      </PortalLayout>
    );
  }

  // Con token pero todavía sin datos: cargando, o un error que el efecto de arriba no maneja
  // (401 ya se resuelve solo, volviendo a la búsqueda) — se ofrece un camino manual de vuelta.
  if (!ticketQuery.data) {
    return (
      <PortalLayout accion={{ to: "/mesa-de-ayuda", label: "Crear ticket" }}>
        {ticketQuery.isError ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center card-elev">
            <p className="text-sm text-muted-foreground">No pudimos cargar tu ticket.</p>
            <Button variant="outline" className="mt-4 h-10" onClick={volverABuscar}>
              Volver a buscar
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
    <PortalLayout accion={{ to: "/mesa-de-ayuda", label: "Crear ticket" }}>
      <button
        onClick={volverABuscar}
        className="text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Consultar otro ticket
      </button>

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
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Fecha estimada
              </dt>
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
          {ticket.mensajes.length === 0 && (
            <li className="text-sm text-muted-foreground">Sin mensajes todavía.</li>
          )}
        </ul>

        <form
          className="mt-4 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!respuesta.trim()) return;
            try {
              await responderComoCliente.mutateAsync({
                portalToken,
                cuerpo: respuesta.trim(),
                ...(archivosRespuesta.length > 0 ? { archivos: archivosRespuesta } : {}),
              });
              setRespuesta("");
              setArchivosRespuesta([]);
              setEnviado(true);
              await ticketQuery.refetch();
            } catch {
              // El toast de error ya lo muestra useResponderComoClientePublico (onError); acá solo
              // se evita que la promesa rechazada de mutateAsync quede sin capturar en la consola.
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
            <Button type="submit" className="h-10" disabled={responderComoCliente.isPending}>
              <Send className="size-4" /> {responderComoCliente.isPending ? "Enviando…" : "Enviar respuesta"}
            </Button>
            {enviado && (
              <span className="flex items-center gap-1.5 text-xs text-baja">
                <Check className="size-3.5" /> Enviamos tu respuesta al equipo.
              </span>
            )}
          </div>
        </form>
      </section>

      {/* Adjuntar evidencia fuera de un mensaje puntual (POST /publico/adjuntos). El detalle
          público no expone ningún id de adjunto (ni por mensaje ni suelto — ver
          src/lib/api/portal.ts), así que no hay nada que listar ni descargar acá: solo la
          confirmación de que se subió. */}
      <section className="mt-4 rounded-xl border border-border bg-card p-5 card-elev sm:p-6">
        <h2 className="text-sm font-semibold">¿Tienes otra evidencia para adjuntar?</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Puedes adjuntar un archivo suelto sin necesidad de escribir un mensaje.
        </p>
        <div className="mt-3">
          <input
            ref={inputArchivoSueltoRef}
            type="file"
            className="hidden"
            onChange={async (e) => {
              const archivo = e.target.files?.[0];
              e.target.value = "";
              if (!archivo) return;
              try {
                await adjuntarArchivo.mutateAsync({ portalToken, archivo });
              } catch {
                return;
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9"
            disabled={adjuntarArchivo.isPending}
            onClick={() => inputArchivoSueltoRef.current?.click()}
          >
            <Paperclip className="size-4" /> {adjuntarArchivo.isPending ? "Subiendo…" : "Adjuntar otro archivo"}
          </Button>
          {adjuntarArchivo.isSuccess && (
            <span className="ml-2 inline-flex items-center gap-1.5 text-xs text-baja">
              <Check className="size-3.5" /> Archivo recibido.
            </span>
          )}
        </div>
      </section>
    </PortalLayout>
  );
}
