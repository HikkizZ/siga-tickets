import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, BadgeDollarSign, Clock3, Inbox, LayoutDashboard, Timer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatoMoneda } from "@/lib/mock-data";
import { etiquetaEstadoCotizacion, etiquetaEstadoOt } from "@/lib/labels";
import { ApiError } from "@/lib/api/client";
import type { DashboardFiltros } from "@/lib/api/dashboard";
import { useDashboard } from "@/hooks/useDashboard";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · Taller OT" },
      {
        name: "description",
        content:
          "Indicadores del taller: OT activas, SLA vencido, monto de cotizaciones aprobadas, carga por responsable y distribución por estado y cliente.",
      },
      { property: "og:title", content: "Dashboard · Taller OT" },
      {
        property: "og:description",
        content: "Reportes y gráficos de órdenes de trabajo y cotizaciones del taller.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function mensajeError(error: unknown): string {
  return error instanceof ApiError ? error.message : "Ocurrió un error inesperado. Intenta de nuevo.";
}

function Kpi({
  titulo,
  valor,
  detalle,
  icono: Icono,
  tono,
  fotoActual,
}: {
  titulo: string;
  valor: string;
  detalle: string;
  icono: typeof Timer;
  tono?: string;
  fotoActual?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 card-elev">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{titulo}</p>
        <Icono className={tono ?? "size-4 text-muted-foreground"} />
      </div>
      <p className={`mt-2 text-2xl font-semibold tracking-tight ${tono ?? ""}`}>{valor}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{detalle}</p>
      {fotoActual && (
        <p className="mt-1 text-[10px] italic text-muted-foreground/80">
          Valor actual — no cambia con el rango de fechas.
        </p>
      )}
    </div>
  );
}

function Panel({
  titulo,
  fotoActual,
  children,
}: {
  titulo: string;
  fotoActual?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 card-elev sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">{titulo}</h2>
        {fotoActual && (
          <span className="rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-[10px] text-muted-foreground">
            Foto actual
          </span>
        )}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

// Los atributos SVG de recharts no aceptan var(--token): se resuelven en runtime.
function useColores() {
  const [colores, setColores] = useState({
    primary: "#0f766e",
    accent: "#0e7490",
    muted: "#64748b",
    border: "#e2e8f0",
    card: "#ffffff",
    baja: "#16a34a",
    alta: "#dc2626",
  });

  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string, fallback: string) => cs.getPropertyValue(n).trim() || fallback;
    setColores({
      primary: v("--primary", "#0f766e"),
      accent: v("--accent-foreground", "#0e7490"),
      muted: v("--muted-foreground", "#64748b"),
      border: v("--border", "#e2e8f0"),
      card: v("--card", "#ffffff"),
      baja: v("--baja", "#16a34a"),
      alta: v("--alta", "#dc2626"),
    });
  }, []);

  return colores;
}

function Dashboard() {
  const colores = useColores();
  const ejeComun = {
    tick: { fontSize: 11, fill: colores.muted },
    stroke: colores.border,
  };
  const estiloTooltip = {
    background: colores.card,
    border: `1px solid ${colores.border}`,
    borderRadius: 8,
    fontSize: 12,
  };
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const filtros: DashboardFiltros = { desde: desde || undefined, hasta: hasta || undefined };
  const { data: d, isLoading, isError, error } = useDashboard(filtros);
  const cargando = isLoading || !d;

  const porEstado = (d?.otPorEstado ?? []).map((f) => ({ nombre: etiquetaEstadoOt(f.estado), cantidad: f.cantidad }));
  const porCliente = (d?.otPorCliente ?? []).map((f) => ({ nombre: f.clienteNombre, cantidad: f.cantidad }));
  const porResponsable = (d?.otPorResponsable ?? []).map((f) => ({
    nombre: f.usuarioNombre.split(" ")[0] ?? f.usuarioNombre,
    cantidad: f.cantidad,
  }));
  const porEstadoCot = (d?.cotizacionesPorEstado ?? []).map((f) => ({
    nombre: etiquetaEstadoCotizacion(f.estado),
    cantidad: f.cantidad,
    monto: f.montoClp,
  }));

  const coloresCot: Record<string, string> = {
    Borrador: colores.muted,
    Enviada: colores.primary,
    Aprobada: colores.baja,
    Rechazada: colores.alta,
  };

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <LayoutDashboard className="size-5 text-primary" /> Dashboard
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Indicadores del taller. Las métricas marcadas "Foto actual" no cambian con el rango de fechas.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2 sm:ml-auto">
          <div className="space-y-1">
            <Label htmlFor="desde" className="text-[11px] text-muted-foreground">
              Desde
            </Label>
            <Input
              id="desde"
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="h-9 w-40 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="hasta" className="text-[11px] text-muted-foreground">
              Hasta
            </Label>
            <Input
              id="hasta"
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="h-9 w-40 text-sm"
            />
          </div>
          {(desde || hasta) && (
            <Button
              variant="outline"
              className="h-9"
              onClick={() => {
                setDesde("");
                setHasta("");
              }}
            >
              <X className="size-4" /> Limpiar
            </Button>
          )}
        </div>
      </div>

      {isError && (
        <div className="mt-4 rounded-lg border border-alta/30 bg-alta/5 px-4 py-2.5 text-sm text-alta">
          No se pudo cargar el dashboard: {mensajeError(error)}
        </div>
      )}

      {!isError && cargando && <p className="mt-6 text-sm text-muted-foreground">Cargando indicadores…</p>}

      {!isError && !cargando && (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              titulo="OT activas"
              valor={String(d.otActivas)}
              detalle="Sin contar Terminado ni Facturado"
              icono={LayoutDashboard}
              fotoActual
            />
            <Kpi
              titulo="SLA vencido"
              valor={String(d.otConSlaVencido)}
              detalle="OT no terminales con SLA vencido"
              icono={AlertTriangle}
              tono="text-alta"
              fotoActual
            />
            <Kpi
              titulo="Cotizaciones aprobadas"
              valor={formatoMoneda(d.montoCotizacionesAprobadas)}
              detalle="Monto aprobado en el período (por fecha de aprobación)"
              icono={BadgeDollarSign}
            />
            <Kpi
              titulo="Resolución promedio"
              valor={d.tiempoMedioResolucionDias == null ? "Sin datos" : `${d.tiempoMedioResolucionDias.toFixed(1)} días`}
              detalle="OT terminadas en el período: desde ingreso hasta el cierre real"
              icono={Timer}
            />
            <Kpi
              titulo="Tickets sin responder fuera de SLA"
              valor={String(d.ticketsSinResponderFueraDeSla)}
              detalle="Sin primera respuesta y con SLA vencido"
              icono={Inbox}
              tono="text-alta"
              fotoActual
            />
            <Kpi
              titulo="Tiempo medio de primera respuesta"
              valor={
                d.tiempoMedioPrimeraRespuestaHoras == null
                  ? "Sin datos"
                  : `${d.tiempoMedioPrimeraRespuestaHoras.toFixed(1)} h`
              }
              detalle="Tickets respondidos en el período (horas de reloj, no hábiles)"
              icono={Clock3}
            />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Panel titulo="OT por estado" fotoActual>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={porEstado} margin={{ top: 4, right: 8, bottom: 4, left: -18 }}>
                  <CartesianGrid stroke={colores.border} vertical={false} />
                  <XAxis dataKey="nombre" interval={0} angle={-18} textAnchor="end" height={54} {...ejeComun} />
                  <YAxis allowDecimals={false} {...ejeComun} />
                  <Tooltip contentStyle={estiloTooltip} />
                  <Bar dataKey="cantidad" name="OT" fill={colores.primary} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            <Panel titulo="OT por cliente (top 10)" fotoActual>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={porCliente} margin={{ top: 4, right: 8, bottom: 4, left: -18 }}>
                  <CartesianGrid stroke={colores.border} vertical={false} />
                  <XAxis dataKey="nombre" interval={0} angle={-18} textAnchor="end" height={54} {...ejeComun} />
                  <YAxis allowDecimals={false} {...ejeComun} />
                  <Tooltip contentStyle={estiloTooltip} />
                  <Bar dataKey="cantidad" name="OT" fill={colores.accent} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            <Panel titulo="Carga de trabajo por responsable (OT activas)" fotoActual>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={porResponsable}
                  layout="vertical"
                  margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
                >
                  <CartesianGrid stroke={colores.border} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} {...ejeComun} />
                  <YAxis type="category" dataKey="nombre" width={72} {...ejeComun} />
                  <Tooltip contentStyle={estiloTooltip} />
                  <Bar dataKey="cantidad" name="OT activas" fill={colores.primary} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            <Panel titulo="Cotizaciones por estado">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={porEstadoCot} margin={{ top: 4, right: 8, bottom: 4, left: -18 }}>
                  <CartesianGrid stroke={colores.border} vertical={false} />
                  <XAxis dataKey="nombre" {...ejeComun} />
                  <YAxis allowDecimals={false} {...ejeComun} />
                  <Tooltip formatter={(v: number) => [String(v), "Cotizaciones"]} contentStyle={estiloTooltip} />
                  <Bar dataKey="cantidad" radius={[6, 6, 0, 0]}>
                    {porEstadoCot.map((c) => (
                      <Cell key={c.nombre} fill={coloresCot[c.nombre] ?? colores.primary} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {porEstadoCot.map((c) => (
                  <li
                    key={c.nombre}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs"
                  >
                    <span className="font-medium">{c.nombre}</span>
                    <span className="text-muted-foreground">
                      {c.cantidad} · <span className="font-mono">{formatoMoneda(c.monto)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
