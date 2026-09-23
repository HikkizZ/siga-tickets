import { useEffect, useState } from "react";
import { Share2, UserCheck } from "lucide-react";
import { Avatar } from "@/components/Prioridad";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  HOY,
  cadenaResponsables,
  formatoDuracion,
  getUsuario,
  usuarios,
  type Derivacion,
} from "@/lib/mock-data";

export function DialogoDerivar({
  abierto,
  onAbrir,
  etiqueta,
  responsableActualId,
  conColaborador = false,
  onDerivar,
  opciones,
}: {
  abierto: boolean;
  onAbrir: (v: boolean) => void;
  etiqueta: string;
  responsableActualId?: string;
  conColaborador?: boolean;
  onDerivar: (datos: { destinoId: string; motivo: string; mantenerColaborador: boolean }) => void;
  /** Fase 1: OTDetail pasa la lista real de usuarios (useUsuarios()) acá; sin esta prop se
   * mantiene el comportamiento original (usuarios del mock), que sigue usando TicketDetail. */
  opciones?: { id: string; nombre: string; rol?: string }[];
}) {
  const listaBase = opciones ?? usuarios;
  const candidatos = listaBase.filter((u) => u.id !== responsableActualId);
  const nombreDe = (id: string) => (opciones ? (opciones.find((u) => u.id === id)?.nombre ?? id) : getUsuario(id).nombre);
  const [destino, setDestino] = useState(candidatos[0]?.id ?? "");
  const [motivo, setMotivo] = useState("");
  const [mantener, setMantener] = useState(true);

  useEffect(() => {
    if (!abierto) return;
    setDestino(candidatos[0]?.id ?? "");
    setMotivo("");
    setMantener(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, responsableActualId]);

  return (
    <Dialog open={abierto} onOpenChange={onAbrir}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Derivar {etiqueta}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Derivar a</Label>
            <Select value={destino} onValueChange={setDestino}>
              <SelectTrigger className="h-10 text-sm">
                <span>{destino ? nombreDe(destino) : "Selecciona una persona"}</span>
              </SelectTrigger>
              <SelectContent>
                {candidatos.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.nombre}
                    {u.rol ? ` · ${u.rol}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Motivo de la derivación</Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej.: requiere cotización y cálculo de horas"
              className="min-h-20 text-sm"
            />
          </div>
          {conColaborador && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={mantener} onCheckedChange={(v) => setMantener(v === true)} />
              Mantenerme como colaborador
            </label>
          )}
          <p className="text-[11px] text-muted-foreground">
            El SLA no se reinicia: sigue contando desde el ingreso original.
          </p>
          <Button
            className="h-10 w-full"
            disabled={!destino || motivo.trim() === ""}
            onClick={() => {
              onDerivar({ destinoId: destino, motivo: motivo.trim(), mantenerColaborador: mantener });
              onAbrir(false);
            }}
          >
            <Share2 className="size-4" /> Derivar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CadenaResponsables({
  item,
}: {
  item: {
    fecha?: string;
    fechaIngreso?: string;
    responsableId?: string;
    recepcionadoPorId?: string;
    derivaciones?: Derivacion[];
  };
}) {
  const tramos = cadenaResponsables(item);
  if (tramos.length === 0) return null;

  return (
    <ol className="mt-3 space-y-4 border-l border-border pl-5">
      {tramos.map((t, i) => (
        <li key={`${t.usuarioId}-${i}`} className="relative">
          <span
            className={cn(
              "absolute -left-[30px] flex size-5 items-center justify-center rounded-full border",
              t.actual ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-card",
            )}
          >
            {t.actual ? <UserCheck className="size-3" /> : <Share2 className="size-3 text-muted-foreground" />}
          </span>
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <Avatar iniciales={getUsuario(t.usuarioId).iniciales} className="size-5 text-[9px]" />
            <span className="font-medium">{getUsuario(t.usuarioId).nombre}</span>
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
            {t.desde} → {t.hasta ?? "ahora"} · {formatoDuracion(t.desde, t.hasta ?? HOY)}
          </p>
          {t.motivoSalida && (
            <p className="mt-1 text-xs text-muted-foreground">Derivó: {t.motivoSalida}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
