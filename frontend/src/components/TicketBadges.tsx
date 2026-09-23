import { AlertTriangle, Clock, Handshake, Inbox, Mail, Phone, ShieldCheck, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanalTicket, EstadoTicket, NivelRespuesta } from "@/lib/mock-data";

const estilosEstado: Record<EstadoTicket, string> = {
  Nuevo: "bg-primary/10 text-primary border-primary/30",
  Abierto: "bg-accent text-accent-foreground border-accent-foreground/20",
  "Esperando cliente": "bg-media-suave text-media border-media/30",
  Resuelto: "bg-baja-suave text-baja border-baja/25",
  Cerrado: "bg-muted text-muted-foreground border-border",
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
      {estado}
    </span>
  );
}

export const iconosCanal: Record<CanalTicket, typeof Mail> = {
  Portal: Inbox,
  Correo: Mail,
  Teléfono: Phone,
  Presencial: Handshake,
  Interno: Users,
};

export function CanalBadge({ canal }: { canal: CanalTicket }) {
  const Icono = iconosCanal[canal];
  return (
    <span className="inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
      <Icono className="size-3" />
      {canal}
    </span>
  );
}

const estilosRespuesta: Record<NivelRespuesta, string> = {
  "En plazo": "bg-baja-suave text-baja border-baja/25",
  "Por vencer": "bg-media-suave text-media border-media/30",
  Vencido: "bg-alta-suave text-alta border-alta/25",
};

const iconosRespuesta: Record<NivelRespuesta, typeof Clock> = {
  "En plazo": ShieldCheck,
  "Por vencer": Clock,
  Vencido: AlertTriangle,
};

export function SlaRespuestaBadge({ nivel, className }: { nivel: NivelRespuesta; className?: string }) {
  const Icono = iconosRespuesta[nivel];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium",
        estilosRespuesta[nivel],
        className,
      )}
      title={`SLA de primera respuesta: ${nivel}`}
    >
      <Icono className="size-3" />
      1.ª respuesta {nivel.toLowerCase()}
    </span>
  );
}
