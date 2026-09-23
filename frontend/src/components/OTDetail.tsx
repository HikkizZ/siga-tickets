import { useEffect, useRef, useState } from "react";
import {
  CalendarClock,
  CalendarRange,
  Download,
  Eye,
  File as FileGenericIcon,
  FileText,
  Image as ImageIcon,
  Lock,
  MessageSquare,
  Paperclip,
  Pencil,
  Plus,
  Share2,
  Upload,
  UserCheck,
  Users as UsersIcon,
} from "lucide-react";
import { toast } from "sonner";
import { DialogoDerivar } from "@/components/Derivacion";
import { EtapasEditor, esEtapaNueva, nuevaEtapa, type EtapaBorrador } from "@/components/EtapasEditor";
import { SelectorColaboradores } from "@/components/SelectorColaboradores";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, EstadoCotizacionBadge, PrioridadBadge, SlaBadge } from "@/components/Prioridad";
import { formatoFecha, formatoFechaHora, formatoMoneda, HOY } from "@/lib/mock-data";
import {
  ESTADOS_OT,
  PRIORIDADES,
  etiquetaCanalTicket,
  etiquetaCategoriaOt,
  etiquetaEstadoOt,
  etiquetaEstadoTicket,
  etiquetaOrigenOt,
  etiquetaPrioridad,
  etiquetaRol,
  puedeEscribirCotizaciones,
} from "@/lib/labels";
import { descargarAdjunto, type EventoOt, type TramoResponsable } from "@/lib/api/ots";
import type { Cotizacion } from "@/lib/api/cotizaciones";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useOTStore } from "@/lib/ot-store";
import { useUsuarios } from "@/hooks/useUsuarios";
import { useCotizaciones, useCrearCotizacion } from "@/hooks/useCotizaciones";
import { useDebounced } from "@/hooks/useDebounced";
import {
  useActualizarEtapa,
  useActualizarOt,
  useAgregarColaborador,
  useAgregarComentario,
  useAgregarHora,
  useCambiarEstadoOt,
  useCrearEtapa,
  useDerivarOt,
  useEliminarEtapa,
  useOt,
  useQuitarColaborador,
  useSubirAdjunto,
  useVincularCotizacion,
} from "@/hooks/useOts";
import { cn, inicialesDeNombre } from "@/lib/utils";
import type { EstadoOt as EstadoOtBackend, Prioridad as PrioridadBackend } from "@/lib/labels";

function formatoBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function iconoPorMime(mime: string) {
  if (mime.startsWith("image/")) return ImageIcon;
  if (mime === "application/pdf") return FileText;
  return FileGenericIcon;
}

/** Duración legible a partir de segundos (la API ya entrega `duracionSeg` calculado). */
function formatoDuracionSeg(seg: number): string {
  const min = Math.round(seg / 60);
  const dias = Math.floor(min / 1440);
  const horas = Math.floor((min % 1440) / 60);
  const resto = min % 60;
  if (dias > 0) return `${dias} d${horas > 0 ? ` ${horas} h` : ""}`;
  if (horas > 0) return `${horas} h${resto > 0 ? ` ${resto} min` : ""}`;
  return `${resto} min`;
}

/** Texto legible por tipo de evento de auditoría (docs/api.md, "Eventos de auditoría"). Los
 * payloads solo traen ids/valores crudos, así que acá se arma la frase mostrada en el historial. */
function textoEvento(e: EventoOt): string {
  const p = e.payload as Record<string, unknown>;
  switch (e.tipo) {
    case "creado":
      return typeof p["origenTicketNumero"] === "string" ? `creó la OT desde ${p["origenTicketNumero"]}` : "creó la OT";
    case "estado_cambiado":
      return `cambió el estado a ${etiquetaEstadoOt(String(p["a"]) as EstadoOtBackend)}`;
    case "prioridad_cambiada":
      return `cambió la prioridad a ${etiquetaPrioridad(String(p["a"]) as PrioridadBackend)}`;
    case "derivado":
      return `derivó la OT${typeof p["motivo"] === "string" ? ` — motivo: ${p["motivo"]}` : ""}`;
    case "comentario":
      return p["visibleCliente"] ? "agregó un comentario visible para el cliente" : "agregó un comentario interno";
    case "horas_registradas":
      return `registró ${p["horas"]} h de trabajo`;
    case "horas_eliminadas":
      return `eliminó ${p["horas"]} h registradas`;
    case "colaborador_agregado":
      return "agregó un colaborador";
    case "colaborador_quitado":
      return "quitó un colaborador";
    case "etapa_creada":
      return "agregó una etapa a la planificación";
    case "etapa_editada":
      return "editó una etapa de la planificación";
    case "etapa_eliminada":
      return "eliminó una etapa de la planificación";
    case "adjunto_agregado":
      return "agregó un adjunto";
    case "ot_editada":
      return "editó datos de la OT";
    case "cotizacion_creada":
      return `creó la cotización ${p["numero"]}`;
    case "cotizacion_vinculada":
      return `vinculó la cotización ${p["numero"]}`;
    case "cotizacion_estado_cambiado":
      return "cambió el estado de una cotización";
    default:
      return e.tipo.replace(/_/g, " ");
  }
}

const iconoPorTipoEvento = (tipo: string) => {
  if (tipo === "creado") return Plus;
  if (tipo === "derivado") return Share2;
  if (tipo.includes("estado") || tipo.includes("prioridad")) return CalendarClock;
  if (tipo === "comentario") return MessageSquare;
  if (tipo.includes("adjunto")) return Paperclip;
  if (tipo.includes("colaborador")) return UsersIcon;
  if (tipo.includes("etapa")) return CalendarRange;
  return Plus;
};

function MiniGantt({ etapas }: { etapas: { id: string; nombre: string; fechaInicio: string; fechaTermino: string }[] }) {
  const dia = 86400000;
  const inicios = etapas.map((e) => new Date(e.fechaInicio + "T12:00:00").getTime());
  const fines = etapas.map((e) => new Date(e.fechaTermino + "T12:00:00").getTime());
  const min = Math.min(...inicios);
  const max = Math.max(...fines);
  const total = Math.max(max - min, dia);
  const hoy = ((HOY.getTime() - min) / total) * 100;

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-border bg-secondary/40 p-3">
      {etapas.map((e) => {
        const ini = new Date(e.fechaInicio + "T12:00:00").getTime();
        const fin = new Date(e.fechaTermino + "T12:00:00").getTime();
        const left = ((ini - min) / total) * 100;
        const width = Math.max(((fin - ini) / total) * 100, 4);
        return (
          <div key={e.id} className="flex items-center gap-3">
            <span className="w-[45%] shrink-0 truncate text-xs font-medium">{e.nombre}</span>
            <span className="relative h-5 flex-1 rounded bg-card">
              {hoy >= 0 && hoy <= 100 && (
                <span className="absolute inset-y-0 w-px bg-alta/70" style={{ left: `${hoy}%` }} aria-hidden />
              )}
              <span
                className="absolute inset-y-0 flex items-center rounded bg-primary/85 px-1.5 text-[10px] font-medium text-primary-foreground"
                style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}
                title={`${formatoFecha(e.fechaInicio)} – ${formatoFecha(e.fechaTermino)}`}
              >
                <span className="truncate">
                  {formatoFecha(e.fechaInicio)}–{formatoFecha(e.fechaTermino)}
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

/** Cadena de responsables real de la OT (ya viene calculada por el backend en
 * `GET /ots/:id` → `cadenaResponsables`) — no confundir con `CadenaResponsables` de
 * Derivacion.tsx, que sigue usando el cálculo mock para tickets (fuera de esta fase). */
function CadenaResponsablesOt({ tramos }: { tramos: TramoResponsable[] }) {
  if (tramos.length === 0) return null;
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
                Recepcionó
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

/** Crea una cotización nueva ya ligada a esta OT (POST /cotizaciones con `otId` fijo). El
 * `clienteId` no se pide: el backend lo autocompleta solo con el de la OT si no es interna, y no
 * lo exige si lo es (docs/api.md, "POST /cotizaciones · gestion, admin"). */
function DialogoCrearCotizacion({
  abierto,
  onAbrir,
  otId,
  onCrear,
}: {
  abierto: boolean;
  onAbrir: (v: boolean) => void;
  otId: string;
  onCrear: (datos: { otId: string; montoClp: number; fecha: string; esPrincipal: boolean }) => void;
}) {
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [esPrincipal, setEsPrincipal] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setMonto("");
    setFecha(hoyISO());
    setEsPrincipal(false);
  }, [abierto]);

  const montoNumerico = Number(monto);
  const montoValido = monto.trim() !== "" && Number.isInteger(montoNumerico) && montoNumerico >= 0;

  return (
    <Dialog open={abierto} onOpenChange={onAbrir}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Crear cotización</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Monto (CLP)</label>
            <Input
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="Ej: 500000"
              inputMode="numeric"
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Fecha</label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-10" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={esPrincipal} onCheckedChange={(v) => setEsPrincipal(v === true)} />
            Es la cotización principal de esta OT
          </label>
          <Button
            className="h-10 w-full"
            disabled={!montoValido}
            onClick={() => {
              onCrear({ otId, montoClp: montoNumerico, fecha, esPrincipal });
              onAbrir(false);
            }}
          >
            <Plus className="size-4" /> Crear cotización
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Busca una cotización EXISTENTE (sin OT, o de otra OT) para vincularla a esta OT
 * (POST /ots/:id/cotizaciones/vincular). Trae una página de /cotizaciones filtrada por texto y
 * deja elegir con un clic — criterio simple, sin un componente de búsqueda nuevo. */
function DialogoVincularCotizacion({
  abierto,
  onAbrir,
  otId,
  onVincular,
}: {
  abierto: boolean;
  onAbrir: (v: boolean) => void;
  otId: string;
  onVincular: (cotizacionId: string) => void;
}) {
  const [texto, setTexto] = useState("");
  const textoDebounced = useDebounced(texto);
  const { data, isLoading } = useCotizaciones({ q: textoDebounced.trim() || undefined, perPage: 20 });

  useEffect(() => {
    if (!abierto) setTexto("");
  }, [abierto]);

  // No tiene sentido ofrecer una cotización que ya pertenece a esta misma OT.
  const candidatas = (data?.items ?? []).filter((c: Cotizacion) => c.ot?.id !== otId);

  return (
    <Dialog open={abierto} onOpenChange={onAbrir}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Vincular cotización existente</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por número o cliente…"
            className="h-10"
          />
          <ul className="max-h-72 space-y-1.5 overflow-y-auto">
            {isLoading && <li className="py-4 text-center text-sm text-muted-foreground">Buscando…</li>}
            {!isLoading && candidatas.length === 0 && (
              <li className="py-4 text-center text-sm text-muted-foreground">Ninguna cotización coincide.</li>
            )}
            {!isLoading &&
              candidatas.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onVincular(c.id);
                      onAbrir(false);
                    }}
                    className="flex w-full flex-wrap items-center gap-2 rounded-md border border-border p-2.5 text-left text-sm transition-colors hover:bg-accent/50"
                  >
                    <span className="font-mono text-xs">{c.numero}</span>
                    <span className="text-xs text-muted-foreground">{c.cliente?.nombre ?? "— sin cliente"}</span>
                    <span className="font-mono text-xs">{formatoMoneda(c.montoClp)}</span>
                    <EstadoCotizacionBadge estado={c.estado} />
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {c.ot ? `ya en ${c.ot.numero}` : "sin OT"}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function OTDetail() {
  const { otSeleccionadaId, abrirOT } = useOTStore();
  const { usuario: usuarioActual } = useAuth();
  const { data: ot, isLoading } = useOt(otSeleccionadaId);
  const { data: usuarios = [] } = useUsuarios();

  const actualizarOt = useActualizarOt();
  const cambiarEstado = useCambiarEstadoOt();
  const derivarOt = useDerivarOt();
  const agregarColaborador = useAgregarColaborador();
  const quitarColaborador = useQuitarColaborador();
  const agregarComentario = useAgregarComentario();
  const agregarHora = useAgregarHora();
  const crearEtapa = useCrearEtapa();
  const actualizarEtapa = useActualizarEtapa();
  const eliminarEtapa = useEliminarEtapa();
  const subirAdjunto = useSubirAdjunto();
  const crearCotizacion = useCrearCotizacion();
  const vincularCotizacion = useVincularCotizacion();

  const [horas, setHoras] = useState("");
  const [descripcionHora, setDescripcionHora] = useState("");
  const [comentario, setComentario] = useState("");
  const [visibleCliente, setVisibleCliente] = useState(false);
  const [editandoEtapas, setEditandoEtapas] = useState(false);
  const [guardandoEtapas, setGuardandoEtapas] = useState(false);
  const [derivar, setDerivar] = useState(false);
  const [crearCotDialog, setCrearCotDialog] = useState(false);
  const [vincularCotDialog, setVincularCotDialog] = useState(false);
  const [borrador, setBorrador] = useState<EtapaBorrador[]>([]);
  const [subiendoAdjunto, setSubiendoAdjunto] = useState(false);
  const inputArchivoRef = useRef<HTMLInputElement>(null);
  const etapasOT = ot?.etapas ?? [];
  // Cotizaciones (Fase 2): escribir es exclusivo de gestion/admin, sin excepción por fila
  // (a diferencia de OT) — se oculta el flujo entero para tecnico/lectura.
  const puedeEscribirCot = !!usuarioActual && puedeEscribirCotizaciones(usuarioActual.rol);

  useEffect(() => {
    setEditandoEtapas(false);
  }, [ot?.id]);

  // Mismo filtro que nueva-ot.tsx: "sistema" e inactivos no son destinos válidos en el backend.
  const opcionesUsuarios = usuarios
    .filter((u) => u.activo && u.username !== "sistema")
    .map((u) => ({ id: u.id, nombre: u.nombre, cargo: u.cargo, rol: etiquetaRol(u.rol) }));

  const guardarPlanificacion = async () => {
    if (!ot) return;
    setGuardandoEtapas(true);
    const validas = borrador.filter((e) => e.nombre.trim() !== "");
    const nuevas = validas.filter((e) => esEtapaNueva(e.id));
    const existentesValidas = validas.filter((e) => !esEtapaNueva(e.id));
    const aActualizar = existentesValidas.filter((e) => {
      const original = etapasOT.find((o) => o.id === e.id);
      return original && (original.nombre !== e.nombre || original.fechaInicio !== e.fechaInicio || original.fechaTermino !== e.fechaTermino);
    });
    const idsValidos = new Set(existentesValidas.map((e) => e.id));
    const aEliminar = etapasOT.filter((o) => !idsValidos.has(o.id));

    await Promise.allSettled([
      ...nuevas.map((e) =>
        crearEtapa.mutateAsync({ id: ot.id, etapa: { nombre: e.nombre, fechaInicio: e.fechaInicio, fechaTermino: e.fechaTermino } }),
      ),
      ...aActualizar.map((e) =>
        actualizarEtapa.mutateAsync({
          id: ot.id,
          etapaId: e.id,
          datos: { nombre: e.nombre, fechaInicio: e.fechaInicio, fechaTermino: e.fechaTermino },
        }),
      ),
      ...aEliminar.map((o) => eliminarEtapa.mutateAsync({ id: ot.id, etapaId: o.id })),
    ]);
    setGuardandoEtapas(false);
    setEditandoEtapas(false);
  };

  const alCambiarColaboradores = async (nuevosIds: string[]) => {
    if (!ot) return;
    const actuales = new Set(ot.colaboradores.map((c) => c.id));
    const nuevos = new Set(nuevosIds);
    const aAgregar = nuevosIds.filter((id) => !actuales.has(id));
    const aQuitar = ot.colaboradores.filter((c) => !nuevos.has(c.id)).map((c) => c.id);
    await Promise.allSettled([
      ...aAgregar.map((usuarioId) => agregarColaborador.mutateAsync({ id: ot.id, usuarioId })),
      ...aQuitar.map((usuarioId) => quitarColaborador.mutateAsync({ id: ot.id, usuarioId })),
    ]);
  };

  const alSubirArchivo = async (archivo: File) => {
    if (!ot) return;
    setSubiendoAdjunto(true);
    try {
      await subirAdjunto.mutateAsync({ id: ot.id, archivo });
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
    <>
      <Sheet open={!!otSeleccionadaId} onOpenChange={(o) => !o && abrirOT(null)}>
        <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-2xl">
          {isLoading && (
            <div className="space-y-4 p-6">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}
          {ot && (
            <>
              <SheetHeader className="space-y-2 border-b border-border px-6 py-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{ot.numero}</span>
                  <PrioridadBadge prioridad={ot.prioridad} />
                  <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {etiquetaEstadoOt(ot.estado)}
                  </span>
                  <SlaBadge nivel={ot.slaEstado} />
                </div>
                <SheetTitle className="text-left text-lg leading-snug">{ot.titulo}</SheetTitle>
                <p className="text-sm text-muted-foreground">{ot.descripcion}</p>
              </SheetHeader>

              <div className="grid grid-cols-1 gap-5 px-6 py-5 sm:grid-cols-3">
                <Campo etiqueta="Cliente">{ot.esInterna ? "— (solicitud interna)" : (ot.cliente?.nombre ?? "—")}</Campo>
                {ot.esInterna && ot.areaInterna && <Campo etiqueta="Área solicitante">{ot.areaInterna}</Campo>}
                <Campo etiqueta="Responsable actual">
                  <span className="flex items-center gap-2">
                    <Avatar iniciales={inicialesDeNombre(ot.responsable.nombre)} />
                    {ot.responsable.nombre}
                  </span>
                </Campo>
                {ot.recepcionadoPor.id !== ot.responsable.id && (
                  <Campo etiqueta="Recepcionado por">
                    <span className="flex items-center gap-2">
                      <Avatar iniciales={inicialesDeNombre(ot.recepcionadoPor.nombre)} className="size-5 text-[9px]" />
                      {ot.recepcionadoPor.nombre}
                    </span>
                  </Campo>
                )}
                <Campo etiqueta="Colaboradores">
                  <SelectorColaboradores
                    valor={ot.colaboradores.map((c) => c.id)}
                    onChange={alCambiarColaboradores}
                    opciones={opcionesUsuarios}
                    excluir={ot.responsable.id}
                    className="h-9"
                  />
                  {ot.colaboradores.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {ot.colaboradores.map((c) => (
                        <li key={c.id} className="flex items-center gap-2 text-xs">
                          <Avatar iniciales={inicialesDeNombre(c.nombre)} className="size-5 text-[9px]" />
                          {c.nombre}
                        </li>
                      ))}
                    </ul>
                  )}
                </Campo>
                <Campo etiqueta="Estado">
                  <Select
                    value={ot.estado}
                    onValueChange={(v) => cambiarEstado.mutate({ id: ot.id, estado: v as EstadoOtBackend })}
                  >
                    <SelectTrigger className="h-8 w-full text-sm sm:w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ESTADOS_OT.map((e) => (
                        <SelectItem key={e} value={e}>
                          {etiquetaEstadoOt(e)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Campo>
                <Campo etiqueta="Prioridad">
                  <Select
                    value={ot.prioridad}
                    onValueChange={(v) => actualizarOt.mutate({ id: ot.id, datos: { prioridad: v as PrioridadBackend } })}
                  >
                    <SelectTrigger className="h-8 w-full text-sm sm:w-28">
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
                <Campo etiqueta="Fecha de ingreso">{formatoFecha(ot.fechaIngreso)}</Campo>
                <Campo etiqueta="Término estimado">
                  {ot.fechaEstimadaTermino ? formatoFecha(ot.fechaEstimadaTermino) : "—"}
                </Campo>
                <Campo etiqueta="Vencimiento SLA">
                  {ot.slaResolucionVenceEn ? (
                    <>
                      <span className={ot.slaEstado === "vencida" ? "font-medium text-alta" : undefined}>
                        {formatoFechaHora(new Date(ot.slaResolucionVenceEn))}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Sin calcular</span>
                  )}
                </Campo>
                <Campo etiqueta="Estado SLA">
                  <SlaBadge nivel={ot.slaEstado} />
                </Campo>
                <Campo etiqueta="Origen del ticket">{etiquetaOrigenOt(ot.origen)}</Campo>
                <Campo etiqueta="Categoría">{etiquetaCategoriaOt(ot.categoria)}</Campo>
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
                <CadenaResponsablesOt tramos={ot.cadenaResponsables} />
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
                        setBorrador(etapasOT.map((e) => ({ id: e.id, nombre: e.nombre, fechaInicio: e.fechaInicio, fechaTermino: e.fechaTermino })));
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
                      fechaInicioPorDefecto={ot.fechaIngreso.slice(0, 10)}
                      fechaFinPorDefecto={ot.fechaEstimadaTermino ?? ot.fechaIngreso.slice(0, 10)}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" className="h-9" disabled={guardandoEtapas} onClick={guardarPlanificacion}>
                        {guardandoEtapas ? "Guardando…" : "Guardar planificación"}
                      </Button>
                      <Button size="sm" variant="outline" className="h-9" onClick={() => setEditandoEtapas(false)}>
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
                        setBorrador([nuevaEtapa(ot.fechaIngreso.slice(0, 10), ot.fechaEstimadaTermino ?? ot.fechaIngreso.slice(0, 10))]);
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
                {ot.cotizaciones.length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {ot.cotizaciones.map((c) => (
                      <li
                        key={c.id}
                        className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card p-3"
                      >
                        <FileText className="size-4 text-muted-foreground" />
                        <span className="font-mono text-xs">{c.numero}</span>
                        <span className="font-mono text-xs text-muted-foreground">{formatoMoneda(c.montoClp)}</span>
                        <EstadoCotizacionBadge estado={c.estado} />
                        {c.esPrincipal && (
                          <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            Principal
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">Sin cotización vinculada.</p>
                )}
                {puedeEscribirCot ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button size="sm" className="h-9" onClick={() => setCrearCotDialog(true)}>
                      <Plus className="size-4" /> Crear cotización
                    </Button>
                    <Button size="sm" variant="outline" className="h-9" onClick={() => setVincularCotDialog(true)}>
                      Vincular cotización existente
                    </Button>
                  </div>
                ) : (
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    Solo gestión o administración pueden crear o vincular cotizaciones.
                  </p>
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
                      const Icono = iconoPorMime(a.mime);
                      return (
                        <li
                          key={a.id}
                          className="flex items-center gap-3 rounded-md border border-border bg-card p-2.5"
                        >
                          <span className="flex size-10 items-center justify-center rounded bg-muted text-muted-foreground">
                            <Icono className="size-4" />
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
                      );
                    })}
                  </ul>
                )}
                <div className="mt-3">
                  <input
                    ref={inputArchivoRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const archivo = e.target.files?.[0];
                      if (archivo) void alSubirArchivo(archivo);
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9"
                    disabled={subiendoAdjunto}
                    onClick={() => inputArchivoRef.current?.click()}
                  >
                    <Upload className="size-4" /> {subiendoAdjunto ? "Subiendo…" : "Subir adjunto"}
                  </Button>
                </div>
              </section>

              <Separator />

              <section className="px-6 py-5">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-semibold">Horas trabajadas</h3>
                  <span className="font-mono text-xs text-muted-foreground">{ot.horas.total} h en total</span>
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
                      {ot.horas.items.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-3 text-muted-foreground">
                            Aún no se registran horas.
                          </td>
                        </tr>
                      ) : (
                        ot.horas.items.map((h) => (
                          <tr key={h.id} className="border-b border-border/70 last:border-0">
                            <td className="py-2">{h.usuario.nombre}</td>
                            <td className="py-2 font-mono text-xs">{formatoFecha(h.fecha)}</td>
                            <td className="py-2 font-mono text-xs">{h.horas}</td>
                            <td className="py-2 text-muted-foreground">{h.detalle ?? "—"}</td>
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
                    if (!n || !descripcionHora.trim() || !usuarioActual) return;
                    agregarHora.mutate({
                      id: ot.id,
                      fecha: new Date().toISOString().slice(0, 10),
                      horas: n,
                      detalle: descripcionHora.trim(),
                      usuarioId: usuarioActual.id,
                    });
                    setHoras("");
                    setDescripcionHora("");
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
                    value={descripcionHora}
                    onChange={(e) => setDescripcionHora(e.target.value)}
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
                <h3 className="text-sm font-semibold">Tickets vinculados</h3>
                {ot.tickets.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">Ningún ticket vinculado a esta OT.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {ot.tickets.map((t) => (
                      <li key={t.id} className="flex gap-3 rounded-md border border-border bg-card p-3">
                        <MessageSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-medium">
                              {t.numero} · {t.asunto}
                            </span>
                            {t.esOrigen && (
                              <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                Origen
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {etiquetaEstadoTicket(t.estado as Parameters<typeof etiquetaEstadoTicket>[0])} ·{" "}
                            {etiquetaCanalTicket(t.canal as Parameters<typeof etiquetaCanalTicket>[0])}
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
                {ot.comentarios.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">Sin comentarios todavía.</p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {ot.comentarios.map((c) => (
                      <li
                        key={c.id}
                        className={
                          c.visibleCliente
                            ? "flex gap-3 rounded-md border border-border bg-card p-3"
                            : "flex gap-3 rounded-md border border-media/30 bg-media-suave p-3"
                        }
                      >
                        <Avatar iniciales={inicialesDeNombre(c.autor.nombre)} />
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{c.autor.nombre}</span>
                            <span className="font-mono">{formatoFechaHora(new Date(c.creadoEn))}</span>
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
                          <p className="mt-1 text-sm">{c.cuerpo}</p>
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
                    agregarComentario.mutate({ id: ot.id, cuerpo: comentario.trim(), visibleCliente });
                    setComentario("");
                  }}
                >
                  <Textarea
                    value={comentario}
                    onChange={(e) => setComentario(e.target.value)}
                    placeholder={
                      visibleCliente ? "Comentario que el cliente podrá ver…" : "Escribe un comentario interno para el equipo…"
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
                  {ot.eventos.map((e) => {
                    const Icono = iconoPorTipoEvento(e.tipo);
                    return (
                      <li key={e.id} className="relative">
                        <span className="absolute -left-[30px] flex size-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
                          <Icono className="size-3" />
                        </span>
                        <p className="text-sm">
                          <span className="font-medium">{e.actor.nombre}</span> {textoEvento(e)}
                        </p>
                        <p className="font-mono text-[11px] text-muted-foreground">{formatoFechaHora(new Date(e.ocurridoEn))}</p>
                      </li>
                    );
                  })}
                  {ot.eventos.length === 0 && <li className="text-sm text-muted-foreground">Sin actividad registrada.</li>}
                </ol>
              </section>
            </>
          )}
        </SheetContent>
      </Sheet>
      <DialogoDerivar
        abierto={derivar}
        onAbrir={setDerivar}
        etiqueta={ot?.numero ?? ""}
        conColaborador
        opciones={opcionesUsuarios}
        {...(ot ? { responsableActualId: ot.responsable.id } : {})}
        onDerivar={({ destinoId, motivo, mantenerColaborador }) => {
          if (!ot) return;
          derivarOt.mutate({ id: ot.id, destinoId, motivo, mantenerComoColaborador: mantenerColaborador });
        }}
      />
      {ot && (
        <>
          <DialogoCrearCotizacion
            abierto={crearCotDialog}
            onAbrir={setCrearCotDialog}
            otId={ot.id}
            onCrear={(datos) => crearCotizacion.mutate(datos)}
          />
          <DialogoVincularCotizacion
            abierto={vincularCotDialog}
            onAbrir={setVincularCotDialog}
            otId={ot.id}
            onVincular={(cotizacionId) => vincularCotizacion.mutate({ id: ot.id, cotizacionId })}
          />
        </>
      )}
    </>
  );
}
