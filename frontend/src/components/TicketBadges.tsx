import { cn } from "@/lib/utils";
import { etiquetaEstadoTicket, type EstadoTicket } from "@/lib/labels";

const estilosEstado: Record<EstadoTicket, string> = {
  nuevo: "bg-primary/10 text-primary border-primary/30",
  abierto: "bg-accent text-accent-foreground border-accent-foreground/20",
  esperando_cliente: "bg-media-suave text-media border-media/30",
  resuelto: "bg-baja-suave text-baja border-baja/25",
  cerrado: "bg-muted text-muted-foreground border-border",
};

export function EstadoTicketBadge({ estado, className }: { estado: EstadoTicket; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium",
        estilosEstado[estado],
        className,
      )}
    >
      {etiquetaEstadoTicket(estado)}
    </span>
  );
}
