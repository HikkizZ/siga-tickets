import { useEffect, useRef, useState } from "react";
import {
  CalendarClock,
  Check,
  Download,
  File as FileGenericIcon,
  Handshake,
  Inbox,
  Link2,
  Lock,
  Mail,
  MessageSquare,
  Paperclip,
  Phone,
  Plus,
  Send,
  Share2,
  User,
  UserCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, PrioridadBadge, SlaBadge } from "@/components/Prioridad";
import { DialogoDerivar } from "@/components/Derivacion";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn, inicialesDeNombre } from "@/lib/utils";
import { areas, formatoFechaHora } from "@/lib/mock-data";
import {
  CATEGORIAS_OT,
  ESTADOS_TICKET,
  PRIORIDADES,
  etiquetaCanalTicket,
  etiquetaCategoriaOt,
  etiquetaEstadoTicket,
  etiquetaPrioridad,
  puedeConvertirTickets,
  type CanalTicket,
  type CategoriaOt,
  type EstadoTicket as EstadoTicketBackend,
  type Prioridad as PrioridadBackend,
} from "@/lib/labels";
import { descargarAdjunto, type TramoResponsable } from "@/lib/api/ots";
import type { ConvertirTicketAOtInput, EventoTicket, MensajeTicket } from "@/lib/api/tickets";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useDebounced } from "@/hooks/useDebounced";
import { useOts } from "@/hooks/useOts";
import { useUsuarios } from "@/hooks/useUsuarios";
import {
  useActualizarTicket,
  useAgregarMensajeTicket,
  useCambiarEstadoTicket,
  useConvertirTicketAOt,
  useDerivarTicket,
  useDesvincularOtDeTicket,
  useSubirAdjuntoTicket,
  useTicket,
  useTomarTicket,
  useVincularOtATicket,
} from "@/hooks/useTickets";

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

function formatoBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

/** Texto legible por tipo de evento del ticket (docs/api.md, "Eventos de auditoría de un
 * ticket") — mismo criterio que textoEvento() de OTDetail.tsx, pero con los tipos propios de
 * ticket (tomado, respuesta_cliente/nota_interna, vinculado_ot/ot_desvinculada…). */
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

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}

/** Cadena de responsables real del ticket (GET /tickets/:id → cadenaResponsables, misma forma
 * que OT — TramoResponsable se reutiliza de src/lib/api/ots.ts). Vacía si el ticket nunca se
 * tomó. */
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
              <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                Tomó el ticket
              </span>
            )}
            {t.actual && (
              <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                Responsable actual
              </span>
            )}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            {formatoFechaHora(new Date(t.desde))} → {t.hasta ? formatoFechaHora(new Date(t.hasta)) : "ahora"} ·{" "}
            {formatoDuracionSeg(t.duracionSeg)}
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

const hoyISO = () => new Date().toISOString().slice(0, 10);

/** Convierte el ticket en una OT nueva ("herencia completa" — docs/api.md,
 * POST /tickets/:id/convertir-a-ot). Sin campo "responsable": la OT hereda la cadena de
 * responsables del ticket, no se elige acá. `categoria` es obligatorio (a diferencia del mock). */
function DialogoConvertirEnOT({
  abierto,
  onAbrir,
  ticket,
  onConvertir,
}: {
  abierto: boolean;
  onAbrir: (v: boolean) => void;
  ticket: { asunto: string; descripcion: string; prioridad: PrioridadBackend; cliente: { id: string; nombre: string } | null };
  onConvertir: (datos: ConvertirTicketAOtInput) => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [categoria, setCategoria] = useState<CategoriaOt>("soporte");
  const [prioridad, setPrioridad] = useState<PrioridadBackend>("media");
  const [ubicacion, setUbicacion] = useState("");
  const [fechaEstimadaTermino, setFechaEstimadaTermino] = useState("");
  const [interna, setInterna] = useState(false);
  const [area, setArea] = useState(areas[0]!);
  const [clienteId, setClienteId] = useState("");

  useEffect(() => {
    if (!abierto) return;
    setTitulo(ticket.asunto);
    setDescripcion(ticket.descripcion);
    setCategoria("soporte");
    setPrioridad(ticket.prioridad);
    setUbicacion("");
    setFechaEstimadaTermino("");
    setInterna(!ticket.cliente);
    setArea(areas[0]!);
    setClienteId(ticket.cliente?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  return (
    <Dialog open={abierto} onOpenChange={onAbrir}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Convertir en orden de trabajo</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <Label className="text-xs">Título</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="h-10" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Descripción</Label>
            <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="min-h-20 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Categoría</Label>
              <Select value={categoria} onValueChange={(v) => setCategoria(v as CategoriaOt)}>
                <SelectTrigger className="h-10 text-sm">
                  <span>{etiquetaCategoriaOt(categoria)}</span>
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS_OT.map((c) => (
                    <SelectItem key={c} value={c}>
                      {etiquetaCategoriaOt(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Prioridad</Label>
              <Select value={prioridad} onValueChange={(v) => setPrioridad(v as PrioridadBackend)}>
                <SelectTrigger className="h-10 text-sm">
                  <span>{etiquetaPrioridad(prioridad)}</span>
                </SelectTrigger>
                <SelectContent>
                  {PRIORIDADES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {etiquetaPrioridad(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Ubicación (opcional)</Label>
            <Input value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} className="h-10" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Fecha estimada de término (opcional)</Label>
            <Input type="date" value={fechaEstimadaTermino} onChange={(e) => setFechaEstimadaTermino(e.target.value)} className="h-10" />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/50 px-3.5 py-2.5">
            <Label htmlFor="interna-conv" className="text-xs font-normal leading-snug">
              ¿Es una solicitud interna?
            </Label>
            <Switch id="interna-conv" checked={interna} onCheckedChange={setInterna} />
          </div>
          {interna ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Área/departamento solicitante</Label>
              <Select value={area} onValueChange={setArea}>
                <SelectTrigger className="h-10 text-sm">
                  <span>{area}</span>
                </SelectTrigger>
                <SelectContent>
                  {areas.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            ticket.cliente && (
              <p className="text-[11px] text-muted-foreground">Cliente del ticket: {ticket.cliente.nombre}</p>
            )
          )}
          <p className="text-[11px] text-muted-foreground">
            La OT hereda la cadena de responsables completa del ticket y el origen se calcula desde su canal.
          </p>
          <Button
            className="h-10 w-full"
            onClick={() => {
              onConvertir({
                titulo: titulo.trim() || ticket.asunto,
                descripcion: descripcion.trim() || ticket.descripcion,
                categoria,
                prioridad,
                ...(ubicacion.trim() ? { ubicacion: ubicacion.trim() } : {}),
                ...(fechaEstimadaTermino ? { fechaEstimadaTermino } : {}),
                ...(interna ? { esInterna: true as const, areaInterna: area } : { esInterna: false as const, ...(clienteId ? { clienteId } : {}) }),
              });
              onAbrir(false);
            }}
          >
            Convertir en OT
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Busca una OT YA existente para vincularla al ticket (POST /tickets/:id/ots), sin herencia —
 * mismo patrón simple que DialogoVincularCotizacion de OTDetail.tsx (Fase 2): texto con debounce
 * sobre GET /ots?q=. */
function DialogoVincularOT({
  abierto,
  onAbrir,
  yaVinculadas,
  onVincular,
}: {
  abierto: boolean;
  onAbrir: (v: boolean) => void;
  yaVinculadas: string[];
  onVincular: (otId: string) => void;
}) {
  const [texto, setTexto] = useState("");
  const textoDebounced = useDebounced(texto);
  const { data, isLoading } = useOts({ q: textoDebounced.trim() || undefined, perPage: 20 });

  useEffect(() => {
    if (!abierto) setTexto("");
  }, [abierto]);

  const candidatas = (data?.items ?? []).filter((o) => !yaVinculadas.includes(o.id));

  return (
    <Dialog open={abierto} onOpenChange={onAbrir}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Vincular a OT existente</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por número o título…" className="h-10" />
          <ul className="max-h-72 space-y-1.5 overflow-y-auto">
            {isLoading && <li className="py-4 text-center text-sm text-muted-foreground">Buscando…</li>}
            {!isLoading && candidatas.length === 0 && (
              <li className="py-4 text-center text-sm text-muted-foreground">Ninguna OT coincide.</li>
            )}
            {!isLoading &&
              candidatas.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onVincular(o.id);
                      onAbrir(false);
                    }}
                    className="flex w-full flex-wrap items-center gap-2 rounded-md border border-border p-2.5 text-left text-sm transition-colors hover:bg-accent/50"
                  >
                    <span className="font-mono text-xs">{o.numero}</span>
                    <span className="truncate text-xs text-muted-foreground">{o.titulo}</span>
                  </button>
                </li>
              ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TicketDetail({ ticketId, onClose }: { ticketId: string | null; onClose: () => void }) {
  const { usuario: usuarioActual } = useAuth();
  const { data: ticket, isLoading } = useTicket(ticketId);
  const { data: usuarios = [] } = useUsuarios();
  // Mismo filtro que OTDetail.tsx / nueva-ot.tsx: "sistema" e inactivos no son destinos válidos
  // en el backend, así que no se ofrecen en el selector de derivación.
  const opcionesUsuarios = usuarios.filter((u) => u.activo && u.username !== "sistema").map((u) => ({ id: u.id, nombre: u.nombre }));

  const actualizarTicket = useActualizarTicket();
  const cambiarEstado = useCambiarEstadoTicket();
  const tomarTicket = useTomarTicket();
  const derivarTicket = useDerivarTicket();
  const agregarMensaje = useAgregarMensajeTicket();
  const subirAdjunto = useSubirAdjuntoTicket();
  const convertirAOt = useConvertirTicketAOt();
  const vincularOt = useVincularOtATicket();
  const desvincularOt = useDesvincularOtDeTicket();

  const [texto, setTexto] = useState("");
  const [interna, setInterna] = useState(false);
  const [adjuntosBorrador, setAdjuntosBorrador] = useState<{ id: string; nombre: string }[]>([]);
  const [subiendoAdjunto, setSubiendoAdjunto] = useState(false);
  const [derivar, setDerivar] = useState(false);
  const [convertir, setConvertir] = useState(false);
  const [vincular, setVincular] = useState(false);
  const inputArchivoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTexto("");
    setInterna(false);
    setAdjuntosBorrador([]);
  }, [ticketId]);

  const puedeConvertir = !!usuarioActual && puedeConvertirTickets(usuarioActual.rol);

  const alSubirArchivos = async (archivos: FileList) => {
    if (!ticket) return;
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

  const otsVinculadasIds = ticket?.ots.map((o) => o.id) ?? [];

  return (
    <>
      <Sheet open={!!ticketId} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-2xl">
          {isLoading && (
            <div className="space-y-4 p-6">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}
          {ticket && (
            <>
              <SheetHeader className="space-y-2 border-b border-border px-6 py-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{ticket.numero}</span>
                  <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {etiquetaEstadoTicket(ticket.estado)}
                  </span>
                  <PrioridadBadge prioridad={ticket.prioridad} />
                  <CanalBadgeReal canal={ticket.canal} />
                  <SlaBadge nivel={ticket.slaEstado} />
                </div>
                <SheetTitle className="text-left text-lg leading-snug">{ticket.asunto}</SheetTitle>
                <p className="text-sm text-muted-foreground">{ticket.descripcion}</p>
              </SheetHeader>

              <div className="grid grid-cols-1 gap-5 px-6 py-5 sm:grid-cols-3">
                <Campo etiqueta="Solicitante">
                  <span className="block">{ticket.solicitanteNombre ?? "—"}</span>
                  <span className="text-xs text-muted-foreground">{ticket.solicitanteEmail ?? "—"}</span>
                </Campo>
                <Campo etiqueta="Cliente">{ticket.cliente?.nombre ?? "—"}</Campo>
                <Campo etiqueta="Ingreso">{formatoFechaHora(new Date(ticket.fechaIngreso))}</Campo>
                <Campo etiqueta="Estado del ticket">
                  <Select value={ticket.estado} onValueChange={(v) => cambiarEstado.mutate({ id: ticket.id, estado: v as EstadoTicketBackend })}>
                    <SelectTrigger className="h-9 w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ESTADOS_TICKET.map((e) => (
                        <SelectItem key={e} value={e}>
                          {etiquetaEstadoTicket(e)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Campo>
                <Campo etiqueta="Prioridad">
                  <Select
                    value={ticket.prioridad}
                    onValueChange={(v) => actualizarTicket.mutate({ id: ticket.id, datos: { prioridad: v as PrioridadBackend } })}
                  >
                    <SelectTrigger className="h-9 w-full text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORIDADES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {etiquetaPrioridad(p)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Campo>
                <Campo etiqueta="Recepcionado por">
                  <span className="flex items-center gap-2">
                    <Avatar iniciales={inicialesDeNombre(ticket.recepcionadoPor.nombre)} className="size-5 text-[9px]" />
                    {ticket.recepcionadoPor.nombre}
                  </span>
                </Campo>
                <Campo etiqueta="Responsable actual">
                  {ticket.responsable ? (
                    <span className="flex items-center gap-2">
                      <Avatar iniciales={inicialesDeNombre(ticket.responsable.nombre)} />
                      {ticket.responsable.nombre}
                    </span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Sin asignar</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={tomarTicket.isPending}
                        onClick={() => tomarTicket.mutate(ticket.id)}
                      >
                        Tomar
                      </Button>
                    </div>
                  )}
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
                <Campo etiqueta="Vencimiento SLA">
                  {ticket.slaResolucionVenceEn ? (
                    <span className={ticket.slaEstado === "vencida" ? "font-medium text-alta" : undefined}>
                      {formatoFechaHora(new Date(ticket.slaResolucionVenceEn))}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Sin calcular</span>
                  )}
                </Campo>
              </div>

              <Separator />

              <section className="px-6 py-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Cadena de responsables</h3>
                  {ticket.responsable && (
                    <Button size="sm" variant="outline" className="h-9" onClick={() => setDerivar(true)}>
                      <Share2 className="size-4" /> Derivar
                    </Button>
                  )}
                </div>
                <CadenaResponsablesTicket tramos={ticket.cadenaResponsables} />
              </section>

              <Separator />

              <section className="px-6 py-5">
                <h3 className="text-sm font-semibold">Órdenes de trabajo</h3>
                {ticket.ots.length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {ticket.ots.map((o) => (
                      <li key={o.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-xs">
                        <Link2 className="size-3.5" />
                        <span className="font-mono">{o.numero}</span>
                        <span className="text-muted-foreground">· {o.titulo}</span>
                        {o.esOrigen && (
                          <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Origen</span>
                        )}
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
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">Este ticket aún no tiene OT.</p>
                )}
                {puedeConvertir ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button size="sm" className="h-9" onClick={() => setConvertir(true)}>
                      Convertir en OT
                    </Button>
                    <Button size="sm" variant="outline" className="h-9" onClick={() => setVincular(true)}>
                      Vincular a OT existente
                    </Button>
                  </div>
                ) : (
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    Solo gestión o administración pueden convertir o vincular órdenes de trabajo.
                  </p>
                )}
              </section>

              <Separator />

              <section className="px-6 py-5">
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
                    await agregarMensaje.mutateAsync({
                      id: ticket.id,
                      tipo: interna ? "nota_interna" : "respuesta_cliente",
                      cuerpo: texto.trim(),
                      ...(adjuntosBorrador.length > 0 ? { adjuntoIds: adjuntosBorrador.map((a) => a.id) } : {}),
                    });
                    setTexto("");
                    setAdjuntosBorrador([]);
                  }}
                >
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={interna ? "outline" : "default"}
                      className="h-8 text-xs"
                      onClick={() => setInterna(false)}
                    >
                      Respuesta al cliente
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={interna ? "default" : "outline"}
                      className="h-8 text-xs"
                      onClick={() => setInterna(true)}
                    >
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
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      disabled={subiendoAdjunto}
                      onClick={() => inputArchivoRef.current?.click()}
                    >
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
                      Marcar “Esperando cliente”
                    </Button>
                  </div>
                </form>
              </section>

              <Separator />

              <section className="px-6 py-5">
                <h3 className="text-sm font-semibold">Adjuntos del ticket</h3>
                {ticket.adjuntos.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">Sin adjuntos sueltos (todos están asociados a un mensaje, o no hay ninguno).</p>
                ) : (
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {ticket.adjuntos.map((a) => (
                      <li key={a.id} className="flex items-center gap-3 rounded-md border border-border bg-card p-2.5">
                        <span className="flex size-10 items-center justify-center rounded bg-muted text-muted-foreground">
                          <FileGenericIcon className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">{a.nombre}</p>
                          <p className="text-[11px] text-muted-foreground">{formatoBytes(a.tamanoBytes)}</p>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
                          aria-label={`Descargar ${a.nombre}`}
                          onClick={() => alDescargar(a.id, a.nombre)}
                        >
                          <Download className="size-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <Separator />

              <section className="px-6 py-5">
                <h3 className="text-sm font-semibold">Historial de actividad</h3>
                {ticket.eventos.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">Sin eventos registrados todavía.</p>
                ) : (
                  <ol className="mt-4 space-y-4 border-l border-border pl-5">
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
              </section>
            </>
          )}
        </SheetContent>
      </Sheet>

      {ticket && (
        <>
          <DialogoDerivar
            abierto={derivar}
            onAbrir={setDerivar}
            etiqueta={ticket.numero}
            opciones={opcionesUsuarios}
            {...(ticket.responsable ? { responsableActualId: ticket.responsable.id } : {})}
            onDerivar={({ destinoId, motivo }) => {
              derivarTicket.mutate({ id: ticket.id, destinoId, motivo });
            }}
          />
          <DialogoConvertirEnOT
            abierto={convertir}
            onAbrir={setConvertir}
            ticket={{ asunto: ticket.asunto, descripcion: ticket.descripcion, prioridad: ticket.prioridad, cliente: ticket.cliente }}
            onConvertir={(datos) => convertirAOt.mutate({ id: ticket.id, ...datos })}
          />
          <DialogoVincularOT
            abierto={vincular}
            onAbrir={setVincular}
            yaVinculadas={otsVinculadasIds}
            onVincular={(otId) => vincularOt.mutate({ id: ticket.id, otId })}
          />
        </>
      )}
    </>
  );
}
