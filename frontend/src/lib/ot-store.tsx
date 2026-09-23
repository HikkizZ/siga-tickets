import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

// Estado de navegación compartido entre pantallas: qué OT/ticket está abierto en su Sheet de
// detalle. Hasta Fase 5 esto era un store mock completo (OT/tickets/cotizaciones/SLA/notificaciones
// de mentira, con decenas de mutadores) — ya no queda ningún dato de negocio acá, todo sale de
// TanStack Query contra el backend real (src/hooks/use*.ts). Solo sobrevive lo que de verdad es
// estado de UI y no tiene un endpoint que lo represente: qué está abierto en pantalla.
type Store = {
  otSeleccionadaId: string | null;
  abrirOT: (id: string | null) => void;
  ticketAbierto: string | null;
  abrirTicket: (id: string | null) => void;
};

// Se reutiliza la misma instancia entre recargas en caliente (HMR) para que el
// provider y los consumidores nunca queden apuntando a contextos distintos.
const globalRef = globalThis as { __otContext?: React.Context<Store | null> };
const OTContext = (globalRef.__otContext ??= createContext<Store | null>(null));

export function OTProvider({ children }: { children: ReactNode }) {
  const [otSeleccionadaId, setOtSeleccionadaId] = useState<string | null>(null);
  const [ticketAbierto, setTicketAbierto] = useState<string | null>(null);

  const value = useMemo<Store>(
    () => ({
      otSeleccionadaId,
      abrirOT: setOtSeleccionadaId,
      ticketAbierto,
      abrirTicket: setTicketAbierto,
    }),
    [otSeleccionadaId, ticketAbierto],
  );

  return <OTContext.Provider value={value}>{children}</OTContext.Provider>;
}

export function useOTStore() {
  const ctx = useContext(OTContext);
  if (!ctx) throw new Error("useOTStore debe usarse dentro de OTProvider");
  return ctx;
}
