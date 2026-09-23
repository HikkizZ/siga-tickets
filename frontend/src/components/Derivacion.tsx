import { useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

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
  opciones: { id: string; nombre: string; rol?: string }[];
}) {
  const candidatos = opciones.filter((u) => u.id !== responsableActualId);
  const nombreDe = (id: string) => candidatos.find((u) => u.id === id)?.nombre ?? id;
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
