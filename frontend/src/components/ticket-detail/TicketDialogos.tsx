import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { areas } from "@/lib/mock-data";
import { CATEGORIAS_OT, etiquetaCategoriaOt, type CategoriaOt } from "@/lib/labels";
import { useOts } from "@/hooks/useOts";
import { usePrioridades } from "@/hooks/usePrioridades";
import { useDebounced } from "@/hooks/useDebounced";
import type { ConvertirTicketAOtInput } from "@/lib/api/tickets";
import type { PrioridadRef } from "@/lib/api/ots";

/** Convierte el ticket en una OT nueva ("herencia completa" — docs/api.md,
 * POST /tickets/:id/convertir-a-ot). Sin campo "responsable": la OT hereda la cadena de
 * responsables del ticket, no se elige acá. `categoria` es obligatorio (a diferencia del mock).
 * Sin cambios de lógica respecto a la Fase 3, solo reubicado desde TicketDetail.tsx (Fase E1). */
export function DialogoConvertirEnOT({
  abierto,
  onAbrir,
  ticket,
  onConvertir,
}: {
  abierto: boolean;
  onAbrir: (v: boolean) => void;
  ticket: { asunto: string; descripcion: string; prioridad: PrioridadRef; cliente: { id: string; nombre: string } | null };
  onConvertir: (datos: ConvertirTicketAOtInput) => void;
}) {
  const { data: prioridades } = usePrioridades();
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [categoria, setCategoria] = useState<CategoriaOt>("soporte");
  const [prioridadId, setPrioridadId] = useState("");
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
    setPrioridadId(ticket.prioridad.id);
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
              <Select value={prioridadId} onValueChange={setPrioridadId}>
                <SelectTrigger className="h-10 text-sm">
                  <span>{(prioridades ?? []).find((p) => p.id === prioridadId)?.nombre ?? "Selecciona una prioridad"}</span>
                </SelectTrigger>
                <SelectContent>
                  {(prioridades ?? [])
                    .filter((p) => p.activo || p.id === ticket.prioridad.id)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nombre}
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
            ticket.cliente && <p className="text-[11px] text-muted-foreground">Cliente del ticket: {ticket.cliente.nombre}</p>
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
                prioridadId,
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
 * sobre GET /ots?q=. Sin cambios de lógica respecto a la Fase 3, solo reubicado (Fase E1). */
export function DialogoVincularOT({
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
            {!isLoading && candidatas.length === 0 && <li className="py-4 text-center text-sm text-muted-foreground">Ninguna OT coincide.</li>}
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
