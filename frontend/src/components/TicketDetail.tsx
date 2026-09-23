import { useState } from "react";
import { Handshake, Inbox, Mail, Phone, Users } from "lucide-react";
import { PrioridadBadge, SlaBadge } from "@/components/Prioridad";
import { EstadoTicketBadge } from "@/components/TicketBadges";
import { DialogoDerivar } from "@/components/Derivacion";
import { TicketConversacion } from "@/components/ticket-detail/TicketConversacion";
import { TicketMetadatos } from "@/components/ticket-detail/TicketMetadatos";
import { TicketExtras } from "@/components/ticket-detail/TicketExtras";
import { DialogoConvertirEnOT, DialogoVincularOT } from "@/components/ticket-detail/TicketDialogos";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { etiquetaCanalTicket, puedeConvertirTickets, type CanalTicket } from "@/lib/labels";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useUsuarios } from "@/hooks/useUsuarios";
import { useConvertirTicketAOt, useDerivarTicket, useTicket, useVincularOtATicket } from "@/hooks/useTickets";

const iconosCanal: Record<CanalTicket, typeof Mail> = {
  portal: Inbox,
  correo: Mail,
  telefono: Phone,
  presencial: Handshake,
  interno: Users,
};

function CanalBadgeReal({ canal }: { canal: CanalTicket }) {
  const Icono = iconosCanal[canal];
  return (
    <span className="inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
      <Icono className="size-3" />
      {etiquetaCanalTicket(canal)}
    </span>
  );
}

/** Detalle de ticket (Fase E1: rediseño de UI centrado en la conversación, inspirado en cómo
 * osTicket/Zendesk/Freshdesk arman su pantalla de respuesta). La conversación
 * (TicketConversacion) queda primero, inmediatamente después de un header compacto — sin la
 * grilla grande de 9 campos ni las secciones de cadena de responsables/OT que antes obligaban a
 * hacer scroll para llegar a responder. Esos metadatos viven ahora en una barra lateral
 * (TicketMetadatos, a la derecha en pantallas anchas — `lg:` — y arriba de la conversación en
 * angostas) con "Convertir en OT" como su primera acción, con peso visual propio. Adjuntos
 * sueltos e historial (TicketExtras) quedan colapsados al final. Ningún hook cambió de Fase 3:
 * este componente solo orquesta a los nuevos subcomponentes de src/components/ticket-detail/. */
export function TicketDetail({ ticketId, onClose }: { ticketId: string | null; onClose: () => void }) {
  const { usuario: usuarioActual } = useAuth();
  const { data: ticket, isLoading } = useTicket(ticketId);
  const { data: usuarios = [] } = useUsuarios();
  // Mismo filtro que OTDetail.tsx / nueva-ot.tsx: "sistema" e inactivos no son destinos válidos
  // en el backend, así que no se ofrecen en el selector de derivación.
  const opcionesUsuarios = usuarios.filter((u) => u.activo && u.username !== "sistema").map((u) => ({ id: u.id, nombre: u.nombre }));

  const derivarTicket = useDerivarTicket();
  const convertirAOt = useConvertirTicketAOt();
  const vincularOt = useVincularOtATicket();

  const [derivar, setDerivar] = useState(false);
  const [convertir, setConvertir] = useState(false);
  const [vincular, setVincular] = useState(false);

  const puedeConvertir = !!usuarioActual && puedeConvertirTickets(usuarioActual.rol);
  const otsVinculadasIds = ticket?.ots.map((o) => o.id) ?? [];

  return (
    <>
      <Sheet open={!!ticketId} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-2xl lg:max-w-4xl xl:max-w-5xl">
          {isLoading && (
            <div className="space-y-4 p-6">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}
          {ticket && (
            <>
              {/* Header compacto: una sola franja de identidad + badges, sin bloque grande. */}
              <SheetHeader className="space-y-1.5 border-b border-border px-6 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{ticket.numero}</span>
                  <EstadoTicketBadge estado={ticket.estado} />
                  <PrioridadBadge prioridad={ticket.prioridad} />
                  <CanalBadgeReal canal={ticket.canal} />
                  <SlaBadge nivel={ticket.slaEstado} />
                </div>
                <SheetTitle className="text-left text-base leading-snug sm:text-lg">{ticket.asunto}</SheetTitle>
                <p className="line-clamp-2 text-xs text-muted-foreground sm:text-sm">{ticket.descripcion}</p>
              </SheetHeader>

              <div className="flex flex-col gap-5 px-6 py-5 lg:flex-row lg:items-start">
                <div className="lg:order-2">
                  <TicketMetadatos
                    ticket={ticket}
                    puedeConvertir={puedeConvertir}
                    onDerivar={() => setDerivar(true)}
                    onConvertir={() => setConvertir(true)}
                    onVincular={() => setVincular(true)}
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-5 lg:order-1">
                  <TicketConversacion ticket={ticket} />
                  <TicketExtras ticket={ticket} />
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {ticket && (
        <>
          <DialogoDerivar
            abierto={derivar}
            onAbrir={setDerivar}
            etiqueta={ticket.numero}
            opciones={opcionesUsuarios}
            {...(ticket.responsable ? { responsableActualId: ticket.responsable.id } : {})}
            onDerivar={({ destinoId, motivo }) => {
              derivarTicket.mutate({ id: ticket.id, destinoId, motivo });
            }}
          />
          <DialogoConvertirEnOT
            abierto={convertir}
            onAbrir={setConvertir}
            ticket={{ asunto: ticket.asunto, descripcion: ticket.descripcion, prioridad: ticket.prioridad, cliente: ticket.cliente }}
            onConvertir={(datos) => convertirAOt.mutate({ id: ticket.id, ...datos })}
          />
          <DialogoVincularOT
            abierto={vincular}
            onAbrir={setVincular}
            yaVinculadas={otsVinculadasIds}
            onVincular={(otId) => vincularOt.mutate({ id: ticket.id, otId })}
          />
        </>
      )}
    </>
  );
}
