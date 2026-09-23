import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Inbox, LogOut } from "lucide-react";
import { PortalLayout } from "@/components/PortalLayout";
import { EstadoTicketBadge } from "@/components/TicketBadges";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatoFecha } from "@/lib/mock-data";
import { ApiError } from "@/lib/api/client";
import { clearCuentaToken } from "@/lib/portal/cuentaToken";
import { useCerrarSesionCuenta, useCuentaSesion, useLimpiarCacheCuenta, useMisTickets } from "@/hooks/usePortalCuenta";

export const Route = createFileRoute("/mesa-de-ayuda/cuenta/mis-tickets")({
  head: () => ({
    meta: [
      { title: "Mis tickets · Mesa de ayuda · Taller OT" },
      { name: "description", content: "Revisa todos tus tickets de soporte en un solo lugar." },
    ],
  }),
  component: MisTickets,
});

const PER_PAGE = 25;

function MisTickets() {
  const navigate = useNavigate();
  const { cuentaToken, revisado } = useCuentaSesion();
  const cerrarSesion = useCerrarSesionCuenta();
  const limpiarCache = useLimpiarCacheCuenta();
  const [page, setPage] = useState(1);

  const ticketsQuery = useMisTickets(cuentaToken, page, PER_PAGE);

  // Token guardado inválido o expirado: se limpia y se vuelve al login, mismo criterio que
  // seguimiento.tsx aplica para el token de portal por ticket.
  useEffect(() => {
    if (!ticketsQuery.isError || !cuentaToken) return;
    const error = ticketsQuery.error;
    if (error instanceof ApiError && error.status === 401) {
      clearCuentaToken();
      limpiarCache();
      void navigate({ to: "/mesa-de-ayuda/cuenta/login", replace: true });
    }
  }, [ticketsQuery.isError, ticketsQuery.error, cuentaToken, limpiarCache, navigate]);

  if (!revisado || !cuentaToken) {
    return (
      <PortalLayout>
        <p className="text-sm text-muted-foreground">Cargando tu cuenta…</p>
      </PortalLayout>
    );
  }

  const items = ticketsQuery.data?.items ?? [];
  const total = ticketsQuery.data?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <PortalLayout accion={{ to: "/mesa-de-ayuda", label: "Crear otro ticket" }}>
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Inbox className="size-5 text-primary" /> Mis tickets
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Todas tus solicitudes de soporte, en un solo lugar.</p>
        </div>
        <Button variant="outline" className="ml-auto h-9" onClick={cerrarSesion}>
          <LogOut className="size-4" /> Cerrar sesión
        </Button>
      </div>

      {ticketsQuery.isLoading ? (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-14 text-center">
          <p className="text-sm text-muted-foreground">Cargando…</p>
        </div>
      ) : items.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-14 text-center">
          <Inbox className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">Todavía no tienes tickets</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Los tickets que crees con este correo van a aparecer acá automáticamente.
          </p>
        </div>
      ) : (
        <ul className="mt-5 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card card-elev">
          {items.map((t) => (
            <li
              key={t.numero}
              className="cursor-pointer px-5 py-4 transition-colors hover:bg-accent/40"
              onClick={() => void navigate({ to: "/mesa-de-ayuda/cuenta/tickets/$numero", params: { numero: t.numero } })}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] text-muted-foreground">{t.numero}</span>
                <h2 className={cn("text-sm font-medium")}>{t.asunto}</h2>
                <EstadoTicketBadge estado={t.estado} />
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                  {formatoFecha(t.fechaIngreso)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {totalPaginas > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2">
          <Button size="sm" variant="outline" className="h-8" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="size-4" /> Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            Página {page} de {totalPaginas}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            disabled={page >= totalPaginas}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </PortalLayout>
  );
}
