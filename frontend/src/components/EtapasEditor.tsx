import { CalendarRange, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Etapa } from "@/lib/mock-data";

export function nuevaEtapa(inicio: string, fin: string): Etapa {
  return { id: `et-${Math.random().toString(36).slice(2, 8)}`, nombre: "", inicio, fin };
}

export function EtapasEditor({
  etapas,
  onChange,
  fechaInicioPorDefecto,
  fechaFinPorDefecto,
}: {
  etapas: Etapa[];
  onChange: (etapas: Etapa[]) => void;
  fechaInicioPorDefecto: string;
  fechaFinPorDefecto: string;
}) {
  const actualizar = (id: string, campo: keyof Etapa, valor: string) =>
    onChange(etapas.map((e) => (e.id === id ? { ...e, [campo]: valor } : e)));

  return (
    <div className="space-y-4">
      {etapas.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-8 text-center">
          <CalendarRange className="size-5 text-muted-foreground" />
          <p className="text-sm font-medium">Sin etapas planificadas</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Divide el trabajo en etapas con fecha de inicio y término para seguir el avance.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {etapas.map((et, i) => (
            <li
              key={et.id}
              className="grid gap-2 rounded-lg border border-border bg-secondary/40 p-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
            >
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Etapa {i + 1}</Label>
                <Input
                  value={et.nombre}
                  onChange={(e) => actualizar(et.id, "nombre", e.target.value)}
                  placeholder="Nombre de la etapa"
                  className="h-9 bg-card"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Inicio</Label>
                <Input
                  type="date"
                  value={et.inicio}
                  onChange={(e) => actualizar(et.id, "inicio", e.target.value)}
                  className="h-9 bg-card"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Término</Label>
                <Input
                  type="date"
                  value={et.fin}
                  onChange={(e) => actualizar(et.id, "fin", e.target.value)}
                  className="h-9 bg-card"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Quitar etapa ${i + 1}`}
                className="size-9 text-muted-foreground hover:text-alta"
                onClick={() => onChange(etapas.filter((x) => x.id !== et.id))}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button
        type="button"
        variant="outline"
        className="h-9"
        onClick={() => onChange([...etapas, nuevaEtapa(fechaInicioPorDefecto, fechaFinPorDefecto)])}
      >
        <Plus className="size-4" /> Agregar etapa
      </Button>
    </div>
  );
}
