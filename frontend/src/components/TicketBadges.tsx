import { cn } from "@/lib/utils";

// Fase C: EstadoTicket dejó de ser un enum fijo con 5 valores — es un catálogo administrable
// (docs/api.md), así que ya no se puede indexar exhaustivamente. Las 5 filas sembradas por la
// migración mantienen su color por nombre; cualquier estado nuevo que cree el admin cae al
// fallback gris hasta que alguien decida darle color explícito (fuera de alcance de esta fase),
// mismo criterio que `estilosPrioridad`/`estilosSla` en src/components/Prioridad.tsx.
const estilosEstado: Record<string, string> = {
  Nuevo: "bg-primary/10 text-primary border-primary/30",
  Abierto: "bg-accent text-accent-foreground border-accent-foreground/20",
  "Esperando cliente": "bg-media-suave text-media border-media/30",
  Resuelto: "bg-baja-suave text-baja border-baja/25",
  Cerrado: "bg-muted text-muted-foreground border-border",
};

// `estado` ya viene como el nombre legible del catálogo (p. ej. "Abierto") directamente desde el
// backend — ya no hay ningún traductor de enum que pasar antes de mostrarlo.
export function EstadoTicketBadge({ estado, className }: { estado: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium",
        estilosEstado[estado] ?? "bg-muted text-muted-foreground border-border",
        className,
      )}
    >
      {estado}
    </span>
  );
}
