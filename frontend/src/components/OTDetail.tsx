import { useEffect, useState } from "react";
import {
  CalendarClock,
  CalendarRange,
  Eye,
  FileText,
  Image as ImageIcon,
  Lock,
  Mail,
  MessageSquare,
  Paperclip,
  Pencil,
  Plus,
  Share2,
} from "lucide-react";
import { CadenaResponsables, DialogoDerivar } from "@/components/Derivacion";
import { EtapasEditor, nuevaEtapa } from "@/components/EtapasEditor";
import { SelectorColaboradores } from "@/components/SelectorColaboradores";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, EstadoCotizacionBadge, PrioridadBadge, SlaBadge } from "@/components/Prioridad";
import {
  ESTADOS_OT,
  HOY,
  formatoFecha,
  formatoFechaHora,
  nivelSla,
  vencimientoSla,
  formatoMoneda,
  getUsuario,
  recepcionadoPor,
  type EstadoOT,
  type Etapa,
  type Prioridad,
} from "@/lib/mock-data";
import { useOTStore } from "@/lib/ot-store";

const iconoAdjunto = { imagen: ImageIcon, pdf: FileText, correo: Mail } as const;
const iconoActividad = { creacion: Plus, estado: CalendarClock, comentario: MessageSquare, adjunto: Paperclip } as const;

function MiniGantt({ etapas }: { etapas: Etapa[] }) {
  const dia = 86400000;
  const inicios = etapas.map((e) => new Date(e.inicio + "T12:00:00").getTime());
  const fines = etapas.map((e) => new Date(e.fin + "T12:00:00").getTime());
  const min = Math.min(...inicios);
  const max = Math.max(...fines);
  const total = Math.max(max - min, dia);
  const hoy = ((HOY.getTime() - min) / total) * 100;

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-border bg-secondary/40 p-3">
      {etapas.map((e) => {
        const ini = new Date(e.inicio + "T12:00:00").getTime();
        const fin = new Date(e.fin + "T12:00:00").getTime();
        const left = ((ini - min) / total) * 100;
        const width = Math.max(((fin - ini) / total) * 100, 4);
        return (
          <div key={e.id} className="flex items-center gap-3">
            <span className="w-[45%] shrink-0 truncate text-xs font-medium">{e.nombre}</span>
            <span className="relative h-5 flex-1 rounded bg-card">
              {hoy >= 0 && hoy <= 100 && (
                <span
                  className="absolute inset-y-0 w-px bg-alta/70"
                  style={{ left: `${hoy}%` }}
                  aria-hidden
                />
              )}
              <span
                className="absolute inset-y-0 flex items-center rounded bg-primary/85 px-1.5 text-[10px] font-medium text-primary-foreground"
                style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}
                title={`${formatoFecha(e.inicio)} – ${formatoFecha(e.fin)}`}
              >
                <span className="truncate">
                  {formatoFecha(e.inicio)}–{formatoFecha(e.fin)}
                </span>
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}

export function OTDetail() {
  const {
    otSeleccionada: ot,
    abrirOT,
    cambiarPrioridad,
    moverOT,
    agregarHora,
    agregarComentario,
    crearCotizacion,
    vincularCotizacion,
    actualizarEtapas,
    actualizarColaboradores,
    derivarOT,
    sla,
    cotizaciones,
    comentarios,
  } = useOTStore();
  const [horas, setHoras] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [comentario, setComentario] = useState("");
  const [visibleCliente, setVisibleCliente] = useState(false);
  const [editandoEtapas, setEditandoEtapas] = useState(false);
  const [derivar, setDerivar] = useState(false);
  const [borrador, setBorrador] = useState<Etapa[]>([]);
  const etapasOT = ot?.etapas ?? [];

  useEffect(() => {
    setEditandoEtapas(false);
  }, [ot?.id]);

  const cotizacion = cotizaciones.find((c) => c.id === ot?.cotizacionId);
  const disponibles = cotizaciones.filter((c) => !c.otId);
  const totalHoras = ot?.horas.reduce((s, h) => s + h.horas, 0) ?? 0;
  const comentariosOT = comentarios.filter((c) => c.otId === ot?.id);

  return (
    <>
    <Sheet open={!!ot} onOpenChange={(o) => !o && abrirOT(null)}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-2xl">
        {ot && (
          <>
            <SheetHeader className="space-y-2 border-b border-border px-6 py-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{ot.id}</span>
                <PrioridadBadge prioridad={ot.prioridad} />
                <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {ot.estado}
                </span>
                <SlaBadge nivel={nivelSla(ot, sla)} />
              </div>
              <SheetTitle className="text-left text-lg leading-snug">{ot.titulo}</SheetTitle>
              <p className="text-sm text-muted-foreground">{ot.descripcion}</p>
            </SheetHeader>

            <div className="grid grid-cols-1 gap-5 px-6 py-5 sm:grid-cols-3">
              <Campo etiqueta="Cliente">{ot.cliente}</Campo>
              <Campo etiqueta="Responsable actual">
                <span className="flex items-center gap-2">
                  <Avatar iniciales={getUsuario(ot.responsableId).iniciales} />
                  {getUsuario(ot.responsableId).nombre}
                </span>
              </Campo>
              {recepcionadoPor(ot) !== ot.responsableId && (
                <Campo etiqueta="Recepcionado por">
                  <span className="flex items-center gap-2">
                    <Avatar
                      iniciales={getUsuario(recepcionadoPor(ot)!).iniciales}
                      className="size-5 text-[9px]"
                    />
                    {getUsuario(recepcionadoPor(ot)!).nombre}
                  </span>
                </Campo>
              )}
              <Campo etiqueta="Colaboradores">
                <SelectorColaboradores
                  valor={ot.colaboradores ?? []}
                  onChange={(ids) => actualizarColaboradores(ot.id, ids)}
                  excluir={ot.responsableId}
                  className="h-9"
                />
                {(ot.colaboradores ?? []).length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {(ot.colaboradores ?? []).map((id) => (
                      <li key={id} className="flex items-center gap-2 text-xs">
                        <Avatar iniciales={getUsuario(id).iniciales} className="size-5 text-[9px]" />
                        {getUsuario(id).nombre}
                      </li>
                    ))}
                  </ul>
                )}
              </Campo>
              <Campo etiqueta="Estado">
                <Select value={ot.estado} onValueChange={(v) => moverOT(ot.id, v as EstadoOT)}>
                  <SelectTrigger className="h-8 w-full text-sm sm:w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ESTADOS_OT.map((e) => (
                      <SelectItem key={e} value={e}>
                        {e}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>
              <Campo etiqueta="Prioridad">
                <Select
                  value={ot.prioridad}
                  onValueChange={(v) => cambiarPrioridad(ot.id, v as Prioridad)}
                >
                  <SelectTrigger className="h-8 w-full text-sm sm:w-28">
                    <SelectValue />
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
              <Campo etiqueta="Fecha de ingreso">{formatoFecha(ot.fechaIngreso)}</Campo>
              <Campo etiqueta="Término estimado">{formatoFecha(ot.fechaEstimada)}</Campo>
              <Campo etiqueta="Vencimiento SLA">
                <span
                  className={
                    nivelSla(ot, sla) === "Vencida" ? "font-medium text-alta" : undefined
                  }
                >
                  {formatoFechaHora(vencimientoSla(ot, sla))}
                </span>
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  {sla[ot.prioridad]} h de plazo · prioridad {ot.prioridad}
                </span>
              </Campo>
              <Campo etiqueta="Estado SLA">
                <SlaBadge nivel={nivelSla(ot, sla)} />
              </Campo>
              {ot.origen && <Campo etiqueta="Origen del ticket">{ot.origen}</Campo>}
              {ot.categoria && <Campo etiqueta="Categoría">{ot.categoria}</Campo>}
              {ot.esSolicitudInterna && ot.area && <Campo etiqueta="Área solicitante">{ot.area}</Campo>}
              {ot.solicitanteNombre && (
                <Campo etiqueta="Solicitante">
                  <span className="block">{ot.solicitanteNombre}</span>
                  {ot.solicitanteContacto && (
                    <span className="text-xs text-muted-foreground">{ot.solicitanteContacto}</span>
                  )}
                </Campo>
              )}
              {ot.ubicacion && <Campo etiqueta="Ubicación">{ot.ubicacion}</Campo>}
            </div>

            <Separator />

            <section className="px-6 py-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Cadena de responsables</h3>
                <Button size="sm" variant="outline" className="h-9" onClick={() => setDerivar(true)}>
                  <Share2 className="size-4" /> Derivar
                </Button>
              </div>
              <CadenaResponsables item={ot} />
            </section>

            <Separator />


            <section className="px-6 py-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">Planificación</h3>
                {etapasOT.length > 0 && !editandoEtapas && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setBorrador(etapasOT);
                      setEditandoEtapas(true);
                    }}
                  >
                    <Pencil className="size-3.5" /> Editar
                  </Button>
                )}
              </div>

              {editandoEtapas ? (
                <div className="mt-3 space-y-4">
                  <EtapasEditor
                    etapas={borrador}
                    onChange={setBorrador}
                    fechaInicioPorDefecto={ot.fechaIngreso}
                    fechaFinPorDefecto={ot.fechaEstimada}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="h-9"
                      onClick={() => {
                        actualizarEtapas(ot.id, borrador.filter((e) => e.nombre.trim() !== ""));
                        setEditandoEtapas(false);
                      }}
                    >
                      Guardar planificación
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9"
                      onClick={() => setEditandoEtapas(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : etapasOT.length > 0 ? (
                <MiniGantt etapas={etapasOT} />
              ) : (
                <div className="mt-3 flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-8 text-center">
                  <CalendarRange className="size-5 text-muted-foreground" />
                  <p className="text-sm font-medium">Sin planificación registrada</p>
                  <p className="max-w-xs text-xs text-muted-foreground">
                    Divide el trabajo en etapas con fecha de inicio y término para seguir el avance.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-1 h-9"
                    onClick={() => {
                      setBorrador([nuevaEtapa(ot.fechaIngreso, ot.fechaEstimada)]);
                      setEditandoEtapas(true);
                    }}
                  >
                    <Plus className="size-4" /> Agregar etapas
                  </Button>
                </div>
              )}
            </section>

            <Separator />

            <section className="px-6 py-5">
              <h3 className="text-sm font-semibold">Cotización</h3>
              {cotizacion ? (
                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-border bg-card p-3">
                  <FileText className="size-4 text-muted-foreground" />
                  <span className="font-mono text-xs">{cotizacion.id}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatoMoneda(cotizacion.monto)}
                  </span>
                  <EstadoCotizacionBadge estado={cotizacion.estado} />
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  <p className="text-sm text-muted-foreground">Sin cotización vinculada.</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" className="h-9" onClick={() => crearCotizacion(ot.id)}>
                      <Plus className="size-4" /> Crear cotización
                    </Button>
                    <Select
                      value=""
                      onValueChange={(v) => vincularCotizacion(ot.id, v)}
                      disabled={disponibles.length === 0}
                    >
                      <SelectTrigger className="h-9 w-full text-sm sm:w-72">
                        <span className="text-muted-foreground">
                          {disponibles.length === 0
                            ? "No hay cotizaciones libres"
                            : "Vincular cotización existente"}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {disponibles.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.id} · {c.cliente} · {formatoMoneda(c.monto)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </section>

            <Separator />

            <section className="px-6 py-5">
              <h3 className="text-sm font-semibold">Adjuntos</h3>
              {ot.adjuntos.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Sin adjuntos.</p>
              ) : (
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {ot.adjuntos.map((a) => {
                    const Icono = iconoAdjunto[a.tipo];
                    return (
                      <li
                        key={a.id}
                        className="flex items-center gap-3 rounded-md border border-border bg-card p-2.5"
                      >
                        <span className="flex size-10 items-center justify-center rounded bg-muted text-muted-foreground">
                          <Icono className="size-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm">{a.nombre}</p>
                          <p className="text-[11px] text-muted-foreground">{a.peso}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <Separator />

            <section className="px-6 py-5">
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold">Horas trabajadas</h3>
                <span className="font-mono text-xs text-muted-foreground">{totalHoras} h en total</span>
              </div>
              <div className="overflow-x-auto">
                <table className="mt-3 w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="py-1.5 font-medium">Persona</th>
                      <th className="py-1.5 font-medium">Fecha</th>
                      <th className="py-1.5 font-medium">Horas</th>
                      <th className="py-1.5 font-medium">Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ot.horas.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-3 text-muted-foreground">
                          Aún no se registran horas.
                        </td>
                      </tr>
                    ) : (
                      ot.horas.map((h) => (
                        <tr key={h.id} className="border-b border-border/70 last:border-0">
                          <td className="py-2">{getUsuario(h.usuarioId).nombre}</td>
                          <td className="py-2 font-mono text-xs">{formatoFecha(h.fecha)}</td>
                          <td className="py-2 font-mono text-xs">{h.horas}</td>
                          <td className="py-2 text-muted-foreground">{h.descripcion}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <form
                className="mt-3 flex flex-wrap items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = Number(horas);
                  if (!n || !descripcion.trim()) return;
                  agregarHora(ot.id, n, descripcion.trim());
                  setHoras("");
                  setDescripcion("");
                }}
              >
                <Input
                  value={horas}
                  onChange={(e) => setHoras(e.target.value)}
                  placeholder="Horas"
                  inputMode="decimal"
                  className="h-9 w-24"
                />
                <Input
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Descripción breve del trabajo"
                  className="h-9 min-w-48 flex-1"
                />
                <Button type="submit" size="sm" className="h-9">
                  <Plus className="size-4" /> Agregar hora
                </Button>
              </form>
            </section>

            <Separator />

            <section className="px-6 py-5">
              <h3 className="text-sm font-semibold">Correos vinculados</h3>
              {ot.correos.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Ningún correo vinculado a esta OT.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {ot.correos.map((c) => (
                    <li key={c.id} className="flex gap-3 rounded-md border border-border bg-card p-3">
                      <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{c.asunto}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.remitente} · {formatoFecha(c.fecha)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <Separator />

            <section className="px-6 py-5">
              <h3 className="text-sm font-semibold">Comentarios</h3>
              {comentariosOT.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Sin comentarios todavía.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {comentariosOT.map((c) => (
                    <li
                      key={c.id}
                      className={
                        c.visibleCliente
                          ? "flex gap-3 rounded-md border border-border bg-card p-3"
                          : "flex gap-3 rounded-md border border-media/30 bg-media-suave p-3"
                      }
                    >
                      <Avatar iniciales={getUsuario(c.usuarioId).iniciales} />
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {getUsuario(c.usuarioId).nombre}
                          </span>
                          <span className="font-mono">{c.fecha}</span>
                          {c.visibleCliente ? (
                            <span className="inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                              <Eye className="size-3" /> Visible para el cliente
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded border border-media/30 bg-card px-1.5 py-0.5 text-[10px] font-medium text-media">
                              <Lock className="size-3" /> Interna
                            </span>
                          )}
                        </p>
                        <p className="mt-1 text-sm">{c.texto}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <form
                className="mt-3 space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!comentario.trim()) return;
                  agregarComentario(ot.id, comentario.trim(), visibleCliente);
                  setComentario("");
                }}
              >
                <Textarea
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  placeholder={
                    visibleCliente
                      ? "Comentario que el cliente podrá ver…"
                      : "Escribe un comentario interno para el equipo…"
                  }
                  className="min-h-20 text-sm"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="submit" size="sm" className="h-9">
                    <MessageSquare className="size-4" /> Comentar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={visibleCliente ? "default" : "outline"}
                    className="h-9 text-xs"
                    onClick={() => setVisibleCliente((v) => !v)}
                  >
                    {visibleCliente ? (
                      <>
                        <Eye className="size-3.5" /> Visible para el cliente
                      </>
                    ) : (
                      <>
                        <Lock className="size-3.5" /> Nota interna
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </section>

            <Separator />

            <section className="px-6 py-5">
              <h3 className="text-sm font-semibold">Historial de actividad</h3>
              <ol className="mt-4 space-y-4 border-l border-border pl-5">
                {[...ot.actividad].reverse().map((e) => {
                  const esDerivacion = e.texto.startsWith("derivó");
                  const Icono = esDerivacion ? Share2 : iconoActividad[e.tipo];
                  return (
                    <li key={e.id} className="relative">
                      <span
                        className={
                          esDerivacion
                            ? "absolute -left-[30px] flex size-5 items-center justify-center rounded-full border border-primary/50 bg-primary/10 text-primary"
                            : "absolute -left-[30px] flex size-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"
                        }
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
            </section>
          </>
        )}
      </SheetContent>
    </Sheet>
    <DialogoDerivar
      abierto={derivar}
      onAbrir={setDerivar}
      etiqueta={ot?.id ?? ""}
      conColaborador
      {...(ot ? { responsableActualId: ot.responsableId } : {})}
      onDerivar={({ destinoId, motivo, mantenerColaborador }) => {
        if (!ot) return;
        derivarOT(ot.id, { destinoId, motivo, mantenerColaborador });
      }}
    />
    </>
  );
}
