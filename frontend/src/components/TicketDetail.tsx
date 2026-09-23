import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Inbox,
  Link2,
  Lock,
  MessageSquare,
  Paperclip,
  Send,
  Share2,
  User,
} from "lucide-react";
import { Avatar, PrioridadBadge } from "@/components/Prioridad";
import { CadenaResponsables, DialogoDerivar } from "@/components/Derivacion";
import { CanalBadge, EstadoTicketBadge, SlaRespuestaBadge } from "@/components/TicketBadges";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  ESTADOS_TICKET,
  clientes,
  formatoFechaHora,
  getUsuario,
  horasPrimeraRespuesta,
  nivelPrimeraRespuesta,
  recepcionadoPor,
  usuarioActual,
  usuarios,
  vencimientoPrimeraRespuesta,
  type EstadoTicket,
  type Prioridad,
} from "@/lib/mock-data";
import { useOTStore } from "@/lib/ot-store";

const iconoActividadTicket = {
  creacion: Inbox,
  estado: ArrowRight,
  comentario: MessageSquare,
  adjunto: Link2,
} as const;

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}

export function TicketDetail({
  ticketId,
  onClose,
}: {
  ticketId: string | null;
  onClose: () => void;
}) {
  const {
    tickets,
    ots,
    slaRespuesta,
    responderTicket,
    cambiarEstadoTicket,
    asignarTicket,
    cambiarPrioridadTicket,
    vincularTicketAOT,
    crearOTDesdeTicket,
    derivarTicket,
    abrirOT,
  } = useOTStore();
  const ticket = tickets.find((t) => t.id === ticketId) ?? null;

  const [texto, setTexto] = useState("");
  const [interna, setInterna] = useState(false);
  const [aviso, setAviso] = useState("");
  const [otParaVincular, setOtParaVincular] = useState("");
  const [convertir, setConvertir] = useState(false);
  const [derivar, setDerivar] = useState(false);
  const [clienteOT, setClienteOT] = useState(clientes[0]!);
  const [tituloOT, setTituloOT] = useState("");
  const [descripcionOT, setDescripcionOT] = useState("");
  const [responsableOT, setResponsableOT] = useState(usuarioActual.id);

  useEffect(() => {
    setTexto("");
    setInterna(false);
    setAviso("");
    setOtParaVincular("");
  }, [ticketId]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(""), 3500);
    return () => clearTimeout(t);
  }, [aviso]);

  const nivel = ticket ? nivelPrimeraRespuesta(ticket, slaRespuesta) : null;
  const horasRespuesta = ticket ? horasPrimeraRespuesta(ticket) : null;

  const abrirConversion = () => {
    if (!ticket) return;
    const coincide = clientes.find(
      (c) => ticket.empresa && c.toLowerCase() === ticket.empresa.toLowerCase(),
    );
    setClienteOT(coincide ?? clientes[0]!);
    setTituloOT(ticket.asunto);
    setDescripcionOT(ticket.descripcion);
    setResponsableOT(ticket.responsableId ?? usuarioActual.id);
    setConvertir(true);
  };

  return (
    <>
      <Sheet open={!!ticket} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-2xl">
          {ticket && (
            <>
              <SheetHeader className="space-y-2 border-b border-border px-6 py-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{ticket.id}</span>
                  <EstadoTicketBadge estado={ticket.estado} />
                  <PrioridadBadge prioridad={ticket.prioridad} />
                  <CanalBadge canal={ticket.canal} />
                  {nivel && <SlaRespuestaBadge nivel={nivel} />}
                </div>
                <SheetTitle className="text-left text-lg leading-snug">{ticket.asunto}</SheetTitle>
                <p className="text-sm text-muted-foreground">{ticket.descripcion}</p>
              </SheetHeader>

              <div className="grid grid-cols-1 gap-5 px-6 py-5 sm:grid-cols-3">
                <Campo etiqueta="Solicitante">
                  <span className="block">{ticket.solicitanteNombre}</span>
                  <span className="text-xs text-muted-foreground">{ticket.solicitanteEmail}</span>
                </Campo>
                <Campo etiqueta="Empresa">{ticket.empresa ?? "—"}</Campo>
                <Campo etiqueta="Ingreso">{ticket.fecha}</Campo>
                <Campo etiqueta="Estado del ticket">
                  <Select
                    value={ticket.estado}
                    onValueChange={(v) => cambiarEstadoTicket(ticket.id, v as EstadoTicket)}
                  >
                    <SelectTrigger className="h-9 w-full text-sm">
                      <span>{ticket.estado}</span>
                    </SelectTrigger>
                    <SelectContent>
                      {ESTADOS_TICKET.map((e) => (
                        <SelectItem key={e} value={e}>
                          {e}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Campo>
                <Campo etiqueta="Prioridad">
                  <Select
                    value={ticket.prioridad}
                    onValueChange={(v) => cambiarPrioridadTicket(ticket.id, v as Prioridad)}
                  >
                    <SelectTrigger className="h-9 w-full text-sm">
                      <span>{ticket.prioridad}</span>
                    </SelectTrigger>
                    <SelectContent>
                      {(["Alta", "Media", "Baja"] as Prioridad[]).map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Campo>
                <Campo etiqueta="Recepcionado por">
                  {recepcionadoPor(ticket) ? (
                    <span className="flex items-center gap-2">
                      <Avatar
                        iniciales={getUsuario(recepcionadoPor(ticket)!).iniciales}
                        className="size-5 text-[9px]"
                      />
                      {getUsuario(recepcionadoPor(ticket)!).nombre}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Ingresó por el portal</span>
                  )}
                </Campo>
                <Campo etiqueta="Responsable actual">

                  <Select
                    value={ticket.responsableId ?? ""}
                    onValueChange={(v) => asignarTicket(ticket.id, v)}
                  >
                    <SelectTrigger className="h-9 w-full text-sm">
                      <span className={cn(!ticket.responsableId && "text-muted-foreground")}>
                        {ticket.responsableId ? getUsuario(ticket.responsableId).nombre : "Sin asignar"}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {usuarios.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.nombre} · {u.rol}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Campo>
                <Campo etiqueta="Primera respuesta">
                  {horasRespuesta !== null ? (
                    <span className="text-baja">{horasRespuesta.toFixed(1)} h desde el ingreso</span>
                  ) : (
                    <span>
                      Pendiente · vence {formatoFechaHora(vencimientoPrimeraRespuesta(ticket, slaRespuesta))}
                    </span>
                  )}
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {slaRespuesta[ticket.prioridad]} h de plazo · prioridad {ticket.prioridad}
                  </span>
                </Campo>
              </div>

              <Separator />

              <section className="px-6 py-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Cadena de responsables</h3>
                  <Button size="sm" variant="outline" className="h-9" onClick={() => setDerivar(true)}>
                    <Share2 className="size-4" /> Derivar
                  </Button>
                </div>
                <CadenaResponsables item={ticket} />
              </section>

              <Separator />


              <section className="px-6 py-5">
                <h3 className="text-sm font-semibold">Órdenes de trabajo</h3>
                {ticket.otIds.length > 0 ? (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {ticket.otIds.map((id) => {
                      const ot = ots.find((o) => o.id === id);
                      return (
                        <li key={id}>
                          <button
                            onClick={() => {
                              onClose();
                              abrirOT(id);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-xs transition-colors hover:border-primary/40"
                          >
                            <Link2 className="size-3.5" />
                            <span className="font-mono">{id}</span>
                            {ot && <span className="text-muted-foreground">· {ot.estado}</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">Este ticket aún no tiene OT.</p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button size="sm" className="h-9" onClick={abrirConversion}>
                    Convertir en OT <ArrowRight className="size-3.5" />
                  </Button>
                  <Select value={otParaVincular} onValueChange={setOtParaVincular}>
                    <SelectTrigger className="h-9 w-full text-xs sm:w-64">
                      <span className="text-muted-foreground">
                        {otParaVincular || "Vincular a OT existente…"}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {ots
                        .filter((o) => !ticket.otIds.includes(o.id))
                        .map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.id} · {o.titulo.slice(0, 40)}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9"
                    disabled={!otParaVincular}
                    onClick={() => {
                      vincularTicketAOT(ticket.id, otParaVincular);
                      setOtParaVincular("");
                    }}
                  >
                    Vincular
                  </Button>
                </div>
              </section>

              <Separator />

              <section className="px-6 py-5">
                <h3 className="text-sm font-semibold">Conversación</h3>
                <ul className="mt-3 space-y-3">
                  {ticket.mensajes.map((m) => (
                    <li
                      key={m.id}
                      className={cn(
                        "flex gap-3 rounded-lg border p-3",
                        m.interna
                          ? "border-media/30 bg-media-suave"
                          : m.autor === "cliente"
                            ? "border-border bg-secondary/50"
                            : "border-border bg-card",
                      )}
                    >
                      {m.autor === "equipo" && m.usuarioId ? (
                        <Avatar iniciales={getUsuario(m.usuarioId).iniciales} />
                      ) : (
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <User className="size-3.5" />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{m.nombre}</span>
                          <span className="font-mono">{m.fecha}</span>
                          {m.interna && (
                            <span className="inline-flex items-center gap-1 rounded border border-media/30 bg-card px-1.5 py-0.5 text-[10px] font-medium text-media">
                              <Lock className="size-3" /> Interna
                            </span>
                          )}
                        </p>
                        <p className="mt-1 whitespace-pre-line text-sm">{m.texto}</p>
                        {m.adjuntos && m.adjuntos.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {m.adjuntos.map((a) => (
                              <span
                                key={a}
                                className="inline-flex items-center gap-1.5 rounded border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                              >
                                <Paperclip className="size-3" />
                                {a}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>

                <form
                  className="mt-4 space-y-3 rounded-lg border border-border bg-card p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!texto.trim()) return;
                    responderTicket(ticket.id, texto.trim(), interna);
                    setAviso(
                      interna
                        ? "Nota interna guardada; el cliente no la verá."
                        : "Respuesta enviada al cliente por correo.",
                    );
                    setTexto("");
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
                    placeholder={
                      interna
                        ? "Nota visible solo para el equipo…"
                        : "Escribe la respuesta que recibirá el cliente…"
                    }
                    className="min-h-24 text-sm"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="submit" size="sm" className="h-9">
                      <Send className="size-4" /> {interna ? "Guardar nota" : "Enviar respuesta"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9"
                      onClick={() => cambiarEstadoTicket(ticket.id, "Esperando cliente")}
                    >
                      Marcar “Esperando cliente”
                    </Button>
                    {aviso && (
                      <span className="flex items-center gap-1.5 text-xs text-baja">
                        <Check className="size-3.5" /> {aviso}
                      </span>
                    )}
                  </div>
                </form>
              </section>

              <Separator />

              <section className="px-6 py-5">
                <h3 className="text-sm font-semibold">Historial de actividad</h3>
                {(ticket.actividad ?? []).length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">Sin eventos registrados todavía.</p>
                ) : (
                  <ol className="mt-4 space-y-4 border-l border-border pl-5">
                    {[...(ticket.actividad ?? [])].reverse().map((e) => {
                      const esDerivacion = e.texto.startsWith("derivó");
                      const Icono = esDerivacion ? Share2 : iconoActividadTicket[e.tipo];
                      return (
                        <li key={e.id} className="relative">
                          <span
                            className={cn(
                              "absolute -left-[30px] flex size-5 items-center justify-center rounded-full border",
                              esDerivacion
                                ? "border-primary/50 bg-primary/10 text-primary"
                                : "border-border bg-card text-muted-foreground",
                            )}
                          >
                            <Icono className="size-3" />
                          </span>
                          <p className={esDerivacion ? "text-sm font-medium" : "text-sm"}>
                            <span className="font-medium">{getUsuario(e.usuarioId).nombre}</span> {e.texto}
                          </p>
                          <p className="font-mono text-[11px] text-muted-foreground">{e.fecha}</p>
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

      <Dialog open={convertir} onOpenChange={setConvertir}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Convertir {ticket?.id} en orden de trabajo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Cliente</Label>
              <Select value={clienteOT} onValueChange={setClienteOT}>
                <SelectTrigger className="h-10 text-sm">
                  <span>{clienteOT}</span>
                </SelectTrigger>
                <SelectContent>
                  {clientes.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {ticket?.empresa && (
                <p className="text-[11px] text-muted-foreground">
                  Empresa del ticket: {ticket.empresa}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Título</Label>
              <Input value={tituloOT} onChange={(e) => setTituloOT(e.target.value)} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descripción</Label>
              <Textarea
                value={descripcionOT}
                onChange={(e) => setDescripcionOT(e.target.value)}
                className="min-h-20 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Responsable</Label>
              <Select value={responsableOT} onValueChange={setResponsableOT}>
                <SelectTrigger className="h-10 text-sm">
                  <span>{getUsuario(responsableOT).nombre}</span>
                </SelectTrigger>
                <SelectContent>
                  {usuarios.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nombre} · {u.rol}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-[11px] text-muted-foreground">
              La OT queda con origen “Mesa de ayuda” y el solicitante del ticket.
            </p>
            <Button
              className="h-10 w-full"
              onClick={() => {
                if (!ticket) return;
                const id = crearOTDesdeTicket(ticket.id, {
                  cliente: clienteOT,
                  titulo: tituloOT.trim() || ticket.asunto,
                  descripcion: descripcionOT.trim(),
                  responsableId: responsableOT,
                });
                setConvertir(false);
                onClose();
                abrirOT(id);
              }}
            >
              Crear OT
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <DialogoDerivar
        abierto={derivar}
        onAbrir={setDerivar}
        etiqueta={ticket?.id ?? ""}
        {...(ticket?.responsableId ? { responsableActualId: ticket.responsableId } : {})}
        onDerivar={({ destinoId, motivo }) => {
          if (!ticket) return;
          derivarTicket(ticket.id, { destinoId, motivo });
          setAviso(`Ticket derivado a ${getUsuario(destinoId).nombre}.`);
        }}
      />
    </>
  );
}
