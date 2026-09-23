import { AlertTriangle, Clock, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { etiquetaEstadoCotizacion, etiquetaPrioridad, etiquetaSlaEstado } from "@/lib/labels";

// Estos tres badges reciben tanto valores del mock ("Alta", "En plazo", "Borrador" — tickets,
// cotizaciones y dashboard, todavía fuera de la Fase 1) como del backend real ("alta", "en_plazo",
// "borrador" — OT desde esta fase). Se normaliza a la clave del backend (minúsculas,
// espacio→guion_bajo) para buscar estilo y etiqueta en un solo lugar, así ningún llamador (dentro
// o fuera de esta fase) necesita adaptarse.
const normalizar = (valor: string) => valor.trim().toLowerCase().replace(/\s+/g, "_");

const estilosSla: Record<string, string> = {
  en_plazo: "bg-baja-suave text-baja border-baja/25",
  por_vencer: "bg-media-suave text-media border-media/30",
  vencida: "bg-alta-suave text-alta border-alta/25",
};

const iconosSla: Record<string, typeof Clock> = {
  en_plazo: ShieldCheck,
  por_vencer: Clock,
  vencida: AlertTriangle,
};

export function SlaBadge({ nivel, className }: { nivel: string; className?: string }) {
  const clave = normalizar(nivel);
  const Icono = iconosSla[clave] ?? Clock;
  const etiqueta = etiquetaSlaEstado(clave as Parameters<typeof etiquetaSlaEstado>[0]);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium",
        estilosSla[clave] ?? "bg-muted text-muted-foreground border-border",
        className,
      )}
      title={`SLA: ${etiqueta}`}
    >
      <Icono className="size-3" />
      {etiqueta}
    </span>
  );
}

const estilosPrioridad: Record<string, string> = {
  alta: "bg-alta-suave text-alta border-alta/25",
  media: "bg-media-suave text-media border-media/30",
  baja: "bg-baja-suave text-baja border-baja/25",
};

export function PrioridadBadge({ prioridad, className }: { prioridad: string; className?: string }) {
  const clave = normalizar(prioridad);
  const etiqueta = etiquetaPrioridad(clave as Parameters<typeof etiquetaPrioridad>[0]);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[11px] font-medium",
        estilosPrioridad[clave] ?? "bg-muted text-muted-foreground border-border",
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {etiqueta}
    </span>
  );
}

const estilosCotizacion: Record<string, string> = {
  borrador: "bg-muted text-muted-foreground border-border",
  enviada: "bg-accent text-accent-foreground border-accent-foreground/20",
  aprobada: "bg-baja-suave text-baja border-baja/25",
  rechazada: "bg-alta-suave text-alta border-alta/25",
};

export function EstadoCotizacionBadge({ estado }: { estado: string }) {
  const clave = normalizar(estado);
  const etiqueta = etiquetaEstadoCotizacion(clave as Parameters<typeof etiquetaEstadoCotizacion>[0]);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium",
        estilosCotizacion[clave] ?? "bg-muted text-muted-foreground border-border",
      )}
    >
      {etiqueta}
    </span>
  );
}

export function Avatar({ iniciales, className }: { iniciales: string; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-6 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-secondary-foreground",
        className,
      )}
      aria-hidden
    >
      {iniciales}
    </span>
  );
}
