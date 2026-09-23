import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Link2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { EstadoCotizacionBadge } from "@/components/Prioridad";
import { formatoFecha, formatoFechaHora, formatoMoneda } from "@/lib/mock-data";
import {
  ESTADOS_COTIZACION,
  etiquetaEstadoCotizacion,
  puedeEscribirCotizaciones,
  transicionesValidasCotizacion,
  type EstadoCotizacion,
} from "@/lib/labels";
import { useOTStore } from "@/lib/ot-store";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useClientes } from "@/hooks/useClientes";
import { useDebounced } from "@/hooks/useDebounced";
import {
  useActualizarCotizacion,
  useCambiarEstadoCotizacion,
  useCotizacion,
  useCotizaciones,
} from "@/hooks/useCotizaciones";
import type { CotizacionesFiltros } from "@/lib/api/cotizaciones";

export const Route = createFileRoute("/cotizaciones")({
  head: () => ({
    meta: [
      { title: "Cotizaciones · Taller OT" },
      {
        name: "description",
        content:
          "Listado de cotizaciones con cliente, monto, estado y la orden de trabajo vinculada, con filtro por estado.",
      },
      { property: "og:title", content: "Cotizaciones · Taller OT" },
      {
        property: "og:description",
        content: "Controla borradores, cotizaciones enviadas, aprobadas y rechazadas en una sola tabla.",
      },
    ],
  }),
  component: Cotizaciones,
});

const PER_PAGE = 25;

/** Texto legible por tipo de evento del timeline de una cotización (docs/api.md, "Eventos de
 * auditoría propios de una cotización" + los de OT que se reflejan acá: creada/vinculada). */
function textoEventoCotizacion(tipo: string, payload: Record<string, unknown>): string {
  switch (tipo) {
    case "cotizacion_creada":
      return "se creó la cotización";
    case "cotizacion_vinculada":
      return "se vinculó a una OT";
    case "cotizacion_estado_cambiado": {
      const de = payload["de"];
      const a = payload["a"];
      return typeof de === "string" && typeof a === "string"
        ? `cambió el estado de ${etiquetaEstadoCotizacion(de as EstadoCotizacion)} a ${etiquetaEstadoCotizacion(a as EstadoCotizacion)}`
        : "cambió el estado";
    }
    case "cotizacion_editada":
      return "editó datos de la cotización";
    default:
      return tipo.replace(/_/g, " ");
  }
}

/** Detalle de una cotización (GET /cotizaciones/:id): timeline propio + transiciones de estado
 * válidas + edición rápida (monto/fecha/cliente) mientras está en borrador. Se decidió construir
 * este panel en vez de dejar la tabla como único punto de contacto: el timeline (`aprobadaEn`,
 * eventos) no cabe en una fila y las transiciones de estado necesitan mostrar solo las válidas
 * para el estado actual, no un select libre con las 4 siempre visibles. */
function DialogoDetalleCotizacion({
  id,
  onCerrar,
  onAbrirOt,
}: {
  id: string | null;
  onCerrar: () => void;
  onAbrirOt: (otId: string) => void;
}) {
  const { usuario } = useAuth();
  const { data: clientes } = useClientes();
  const { data: cot, isLoading } = useCotizacion(id);
  const cambiarEstado = useCambiarEstadoCotizacion();
  const actualizar = useActualizarCotizacion();

  const [editando, setEditando] = useState(false);
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState("");
  const [clienteId, setClienteId] = useState("");

  useEffect(() => {
    setEditando(false);
  }, [id]);

  useEffect(() => {
    if (!cot) return;
    setMonto(String(cot.montoClp));
    setFecha(cot.fecha);
    setClienteId(cot.cliente?.id ?? "");
  }, [cot]);

  const puedeEscribir = !!usuario && puedeEscribirCotizaciones(usuario.rol);
  const transiciones = cot ? transicionesValidasCotizacion(cot.estado) : [];
  const montoNumerico = Number(monto);
  const montoValido = monto.trim() !== "" && Number.isInteger(montoNumerico) && montoNumerico >= 0;

  return (
    <Dialog open={!!id} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="sm:max-w-lg">
        {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {cot && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{cot.numero}</span>
                <EstadoCotizacionBadge estado={cot.estado} />
                {cot.esPrincipal && (
                  <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    Principal
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Cliente</p>
                <p className="mt-0.5">{cot.cliente?.nombre ?? "—"}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">OT vinculada</p>
                <p className="mt-0.5">
                  {cot.ot ? (
                    <button
                      onClick={() => {
                        onAbrirOt(cot.ot!.id);
                        onCerrar();
                      }}
                      className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                    >
                      <Link2 className="size-3" /> {cot.ot.numero}
                    </button>
                  ) : (
                    "—"
                  )}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Monto</p>
                <p className="mt-0.5 font-mono text-xs">{formatoMoneda(cot.montoClp)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Fecha</p>
                <p className="mt-0.5 font-mono text-xs">{formatoFecha(cot.fecha)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Versión</p>
                <p className="mt-0.5 font-mono text-xs">{cot.version}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Aprobada el</p>
                <p className="mt-0.5 font-mono text-xs">
                  {cot.aprobadaEn ? formatoFechaHora(new Date(cot.aprobadaEn)) : "—"}
                </p>
              </div>
            </div>

            {puedeEscribir && (
              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-xs font-medium text-muted-foreground">Cambiar estado</p>
                {transiciones.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin transiciones disponibles desde este estado.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {transiciones.map((e) => (
                      <Button
                        key={e}
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        disabled={cambiarEstado.isPending}
                        onClick={() => cambiarEstado.mutate({ id: cot.id, estado: e })}
                      >
                        {etiquetaEstadoCotizacion(e)}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {puedeEscribir && cot.estado === "borrador" && (
              <div className="space-y-2 border-t border-border pt-3">
                {editando ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground">Monto (CLP)</label>
                        <Input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="numeric" className="h-9" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground">Fecha</label>
                        <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-9" />
                      </div>
                    </div>
                    {cot.cliente && (
                      <div className="space-y-1.5">
                        <label className="text-xs text-muted-foreground">Cliente</label>
                        <Select value={clienteId} onValueChange={setClienteId}>
                          <SelectTrigger className="h-9 text-sm">
                            <span>{clientes?.find((c) => c.id === clienteId)?.nombre ?? "Selecciona un cliente"}</span>
                          </SelectTrigger>
                          <SelectContent>
                            {(clientes ?? []).map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.nombre}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="h-9"
                        disabled={!montoValido || actualizar.isPending}
                        onClick={() => {
                          actualizar.mutate({
                            id: cot.id,
                            datos: {
                              montoClp: montoNumerico,
                              fecha,
                              ...(cot.cliente ? { clienteId } : {}),
                            },
                          });
                          setEditando(false);
                        }}
                      >
                        Guardar cambios
                      </Button>
                      <Button size="sm" variant="outline" className="h-9" onClick={() => setEditando(false)}>
                        Cancelar
                      </Button>
                    </div>
                  </>
                ) : (
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setEditando(true)}>
                    Editar monto, fecha o cliente
                  </Button>
                )}
              </div>
            )}

            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground">Historial</p>
              {cot.eventos.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin eventos registrados.</p>
              ) : (
                <ol className="space-y-2">
                  {cot.eventos.map((e) => (
                    <li key={e.id} className="text-xs">
                      <span className="font-medium">{e.actor.nombre}</span> {textoEventoCotizacion(e.tipo, e.payload)}
                      <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                        {formatoFechaHora(new Date(e.ocurridoEn))}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Cotizaciones() {
  const { abrirOT } = useOTStore();
  const { usuario } = useAuth();
  const { data: clientes } = useClientes();

  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState("todos");
  const [clienteId, setClienteId] = useState("todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [page, setPage] = useState(1);
  const [detalleId, setDetalleId] = useState<string | null>(null);

  const textoDebounced = useDebounced(texto);

  useEffect(() => {
    setPage(1);
  }, [textoDebounced, estado, clienteId, desde, hasta]);

  const filtros: CotizacionesFiltros = {
    page,
    perPage: PER_PAGE,
    q: textoDebounced.trim() || undefined,
    estado: estado === "todos" ? undefined : (estado as EstadoCotizacion),
    clienteId: clienteId === "todos" ? undefined : clienteId,
    desde: desde || undefined,
    hasta: hasta || undefined,
  };
  const { data, isLoading } = useCotizaciones(filtros);
  const filas = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / PER_PAGE));

  const puedeEscribir = !!usuario && puedeEscribirCotizaciones(usuario.rol);

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-lg font-semibold">Cotizaciones</h1>
          <p className="text-sm text-muted-foreground">Estado comercial de cada propuesta enviada.</p>
        </div>
        {!puedeEscribir && (
          <span className="ml-auto text-[11px] text-muted-foreground">Solo lectura para tu rol.</span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por número o cliente…"
            className="h-9 pl-9 text-sm"
          />
        </div>
        <Select value={estado} onValueChange={setEstado}>
          <SelectTrigger className="h-9 w-44 text-sm">
            <span>{estado === "todos" ? "Todos los estados" : etiquetaEstadoCotizacion(estado as EstadoCotizacion)}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            {ESTADOS_COTIZACION.map((e) => (
              <SelectItem key={e} value={e}>
                {etiquetaEstadoCotizacion(e)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={clienteId} onValueChange={setClienteId}>
          <SelectTrigger className="h-9 w-52 text-sm">
            <span>{clienteId === "todos" ? "Cliente" : (clientes?.find((c) => c.id === clienteId)?.nombre ?? "Cliente")}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todo cliente</SelectItem>
            {(clientes ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-9 w-36 text-sm" />
          <span className="text-xs text-muted-foreground">a</span>
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-9 w-36 text-sm" />
        </div>
        <span className="text-xs text-muted-foreground sm:ml-auto">
          {total} cotizaciones · página {page} de {totalPaginas}
        </span>
      </div>

      <div className="mt-5 overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-2.5 font-medium">Cotización</th>
              <th className="px-5 py-2.5 font-medium">Cliente</th>
              <th className="px-5 py-2.5 font-medium">Fecha</th>
              <th className="px-5 py-2.5 text-right font-medium">Monto</th>
              <th className="px-5 py-2.5 font-medium">Estado</th>
              <th className="px-5 py-2.5 font-medium">OT vinculada</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-sm text-muted-foreground">
                  Cargando…
                </td>
              </tr>
            )}
            {!isLoading && filas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-sm text-muted-foreground">
                  Ninguna cotización coincide con estos filtros.
                </td>
              </tr>
            )}
            {!isLoading &&
              filas.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setDetalleId(c.id)}
                  className="cursor-pointer border-b border-border/70 last:border-0 hover:bg-muted/50"
                >
                  <td className="px-5 py-3 font-mono text-xs">{c.numero}</td>
                  <td className="px-5 py-3">{c.cliente?.nombre ?? "—"}</td>
                  <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{formatoFecha(c.fecha)}</td>
                  <td className="px-5 py-3 text-right font-mono text-xs">{formatoMoneda(c.montoClp)}</td>
                  <td className="px-5 py-3">
                    <EstadoCotizacionBadge estado={c.estado} />
                  </td>
                  <td className="px-5 py-3">
                    {c.ot ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          abrirOT(c.ot!.id);
                        }}
                        className="inline-flex items-center gap-1 font-mono text-xs text-primary transition-colors hover:underline"
                      >
                        <Link2 className="size-3" /> {c.ot.numero}
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {totalPaginas > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2">
          <Button size="sm" variant="outline" className="h-8" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="size-4" /> Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            Página {page} de {totalPaginas}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            disabled={page >= totalPaginas}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente <ChevronRight className="size-4" />
          </Button>
        </div>
      )}

      <DialogoDetalleCotizacion id={detalleId} onCerrar={() => setDetalleId(null)} onAbrirOt={abrirOT} />
    </div>
  );
}
