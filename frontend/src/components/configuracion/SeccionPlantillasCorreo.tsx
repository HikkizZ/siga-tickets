// Sección "Plantillas de correo" de /configuracion (Fase B2, docs/api.md). Las 3 plantillas fijas
// de correo saliente, solo edición (sin creación ni borrado): asunto, cuerpo (textarea de texto
// plano — el contenido real ES el HTML con placeholders, no hace falta un editor WYSIWYG), toggle
// activa/inactiva y ayuda de qué placeholders acepta cada una.
import { useEffect, useState } from "react";
import { Check, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useActualizarPlantillaCorreo, usePlantillasCorreo } from "@/hooks/usePlantillasCorreo";
import {
  PLACEHOLDERS_PLANTILLA,
  type NombrePlantilla,
  type PlantillaCorreo,
} from "@/lib/api/plantillasCorreo";

const ETIQUETAS_PLANTILLA: Record<NombrePlantilla, string> = {
  ticket_creado: "Ticket creado (al solicitante)",
  aviso_soporte: "Aviso a soporte (al crearse un ticket del portal)",
  respuesta_cliente: "Respuesta al cliente (mensaje del panel interno)",
};

type BorradorPlantilla = { asunto: string; cuerpoHtml: string; activa: boolean };

function aBorrador(p: PlantillaCorreo): BorradorPlantilla {
  return { asunto: p.asunto, cuerpoHtml: p.cuerpoHtml, activa: p.activa };
}

/** Una plantilla: card con asunto, cuerpo, activa y la lista de placeholders que acepta. Guarda su
 * propio borrador (independiente de las otras 2 plantillas) sincronizado con el servidor al
 * cargar y al guardar — mismo criterio que SeccionCorreo/la tabla de SLA. */
function TarjetaPlantilla({ plantilla, puedeEscribir }: { plantilla: PlantillaCorreo; puedeEscribir: boolean }) {
  const guardarPlantilla = useActualizarPlantillaCorreo();
  const [borrador, setBorrador] = useState<BorradorPlantilla>(() => aBorrador(plantilla));
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    setBorrador(aBorrador(plantilla));
  }, [plantilla]);

  useEffect(() => {
    if (!guardado) return;
    const t = setTimeout(() => setGuardado(false), 2500);
    return () => clearTimeout(t);
  }, [guardado]);

  const guardar = () => {
    if (!borrador.asunto.trim() || !borrador.cuerpoHtml.trim()) return;
    guardarPlantilla.mutate(
      { nombre: plantilla.nombre, datos: { asunto: borrador.asunto, cuerpoHtml: borrador.cuerpoHtml, activa: borrador.activa } },
      { onSuccess: () => setGuardado(true) },
    );
  };

  const idAsunto = `plantilla-${plantilla.nombre}-asunto`;
  const idCuerpo = `plantilla-${plantilla.nombre}-cuerpo`;
  const idActiva = `plantilla-${plantilla.nombre}-activa`;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card card-elev p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{ETIQUETAS_PLANTILLA[plantilla.nombre]}</h3>
          <p className="font-mono text-[11px] text-muted-foreground">{plantilla.nombre}</p>
        </div>
        <span
          className={
            plantilla.personalizada
              ? "rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
              : "rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
          }
        >
          {plantilla.personalizada ? "Personalizada" : "Texto fijo (sin personalizar)"}
        </span>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={idAsunto} className="text-xs">
          Asunto
        </Label>
        {puedeEscribir ? (
          <Input
            id={idAsunto}
            value={borrador.asunto}
            onChange={(e) => setBorrador((prev) => ({ ...prev, asunto: e.target.value }))}
            className="h-9"
          />
        ) : (
          <p className="text-sm">{borrador.asunto}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={idCuerpo} className="text-xs">
          Cuerpo (HTML con placeholders)
        </Label>
        {puedeEscribir ? (
          <Textarea
            id={idCuerpo}
            value={borrador.cuerpoHtml}
            onChange={(e) => setBorrador((prev) => ({ ...prev, cuerpoHtml: e.target.value }))}
            className="min-h-40 font-mono text-xs"
          />
        ) : (
          <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-secondary/40 p-2 font-mono text-xs">
            {borrador.cuerpoHtml}
          </pre>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        <span>Placeholders disponibles:</span>
        {PLACEHOLDERS_PLANTILLA[plantilla.nombre].map((ph) => (
          <code key={ph} className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono">
            {`{{${ph}}}`}
          </code>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <div className="flex items-center gap-2">
          <Switch
            id={idActiva}
            checked={borrador.activa}
            disabled={!puedeEscribir}
            onCheckedChange={(v) => setBorrador((prev) => ({ ...prev, activa: v }))}
          />
          <Label htmlFor={idActiva} className="text-xs font-normal">
            Activa
          </Label>
        </div>
        {puedeEscribir && (
          <>
            <Button
              size="sm"
              className="h-8 text-xs"
              onClick={guardar}
              disabled={guardarPlantilla.isPending || !borrador.asunto.trim() || !borrador.cuerpoHtml.trim()}
            >
              {guardarPlantilla.isPending ? "Guardando…" : "Guardar plantilla"}
            </Button>
            {guardado && (
              <span className="flex items-center gap-1.5 text-xs text-baja">
                <Check className="size-3.5" /> Guardada
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function SeccionPlantillasCorreo({ puedeEscribir }: { puedeEscribir: boolean }) {
  const { data: plantillas, isLoading, isError } = usePlantillasCorreo();

  return (
    <div className="mt-4 space-y-4">
      {!puedeEscribir && (
        <p className="flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          <ShieldAlert className="size-4 shrink-0" />
          Solo un administrador puede editar las plantillas de correo. Estás viendo el texto actual de solo
          lectura.
        </p>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Cargando plantillas de correo…</p>}
      {isError && <p className="text-sm text-alta">No se pudieron cargar las plantillas de correo.</p>}

      {plantillas?.map((p) => (
        <TarjetaPlantilla key={p.nombre} plantilla={p} puedeEscribir={puedeEscribir} />
      ))}
    </div>
  );
}
