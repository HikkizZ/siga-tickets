import { AlertTriangle, Clock, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { getUsuario } from "@/lib/mock-data";
import type { EstadoCotizacion, NivelSla, Prioridad } from "@/lib/mock-data";

const estilosSla: Record<NivelSla, string> = {
  "En plazo": "bg-baja-suave text-baja border-baja/25",
  "Por vencer": "bg-media-suave text-media border-media/30",
  Vencida: "bg-alta-suave text-alta border-alta/25",
};

const iconosSla: Record<NivelSla, typeof Clock> = {
  "En plazo": ShieldCheck,
  "Por vencer": Clock,
  Vencida: AlertTriangle,
};

export function SlaBadge({ nivel, className }: { nivel: NivelSla; className?: string }) {
  const Icono = iconosSla[nivel];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium",
        estilosSla[nivel],
        className,
      )}
      title={`SLA: ${nivel}`}
    >
      <Icono className="size-3" />
      {nivel}
    </span>
  );
}

const estilosPrioridad: Record<Prioridad, string> = {
  Alta: "bg-alta-suave text-alta border-alta/25",
  Media: "bg-media-suave text-media border-media/30",
  Baja: "bg-baja-suave text-baja border-baja/25",
};

export function PrioridadBadge({ prioridad, className }: { prioridad: Prioridad; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[11px] font-medium",
        estilosPrioridad[prioridad],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {prioridad}
    </span>
  );
}

const estilosCotizacion: Record<EstadoCotizacion, string> = {
  Borrador: "bg-muted text-muted-foreground border-border",
  Enviada: "bg-accent text-accent-foreground border-accent-foreground/20",
  Aprobada: "bg-baja-suave text-baja border-baja/25",
  Rechazada: "bg-alta-suave text-alta border-alta/25",
};

export function EstadoCotizacionBadge({ estado }: { estado: EstadoCotizacion }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium",
        estilosCotizacion[estado],
      )}
    >
      {estado}
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

export function AvataresEquipo({
  responsableId,
  colaboradores = [],
  className,
}: {
  responsableId: string;
  colaboradores?: string[] | undefined;
  className?: string;
}) {
  const responsable = getUsuario(responsableId);
  const extras = colaboradores.filter((id) => id !== responsableId);
  const visibles = extras.slice(0, 3);
  const restantes = extras.length - visibles.length;

  return (
    <span className={cn("flex items-center", className)} title={
      [responsable.nombre, ...extras.map((id) => getUsuario(id).nombre)].join(", ")
    }>
      <Avatar iniciales={responsable.iniciales} className="ring-2 ring-card" />
      {visibles.map((id) => (
        <Avatar
          key={id}
          iniciales={getUsuario(id).iniciales}
          className="-ml-2 bg-muted text-muted-foreground ring-2 ring-card"
        />
      ))}
      {restantes > 0 && (
        <span className="-ml-2 flex size-6 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-accent-foreground ring-2 ring-card">
          +{restantes}
        </span>
      )}
    </span>
  );
}
