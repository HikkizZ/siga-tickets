import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import {
  ESTADOS_COTIZACION,
  ESTADOS_OT,
  formatoMoneda,
  horasPrimeraRespuesta,
  nivelPrimeraRespuesta,
  nivelSla,
  usuarios,
} from "@/lib/mock-data";
import { useOTStore } from "@/lib/ot-store";

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

const ESTADOS_CERRADOS = ["Terminado", "Facturado"] as const;

function Kpi({
  titulo,
  valor,
  detalle,
  icono: Icono,
  tono,
}: {
  titulo: string;
  valor: string;
  detalle: string;
  icono: typeof Timer;
  tono?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 card-elev">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{titulo}</p>
        <Icono className={tono ?? "size-4 text-muted-foreground"} />
      </div>
      <p className={`mt-2 text-2xl font-semibold tracking-tight ${tono ?? ""}`}>{valor}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{detalle}</p>
    </div>
  );
}

function Panel({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 card-elev sm:p-5">
      <h2 className="text-sm font-semibold tracking-tight">{titulo}</h2>
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
  const { ots, cotizaciones, sla, tickets, slaRespuesta } = useOTStore();
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

  const enRango = (fecha: string) =>
    (desde === "" || fecha >= desde) && (hasta === "" || fecha <= hasta);

  const datos = useMemo(() => {
    const visibles = ots.filter((o) => enRango(o.fechaIngreso));
    const activas = visibles.filter((o) => !ESTADOS_CERRADOS.includes(o.estado as never));
    const vencidas = visibles.filter((o) => nivelSla(o, sla) === "Vencida");

    const cotsVisibles = cotizaciones.filter((c) => enRango(c.fecha));
    const montoAprobado = cotsVisibles
      .filter((c) => c.estado === "Aprobada")
      .reduce((s, c) => s + c.monto, 0);

    const cerradas = visibles.filter((o) => ESTADOS_CERRADOS.includes(o.estado as never));
    const dias = cerradas.map((o) => {
      const ini = new Date(o.fechaIngreso + "T12:00:00").getTime();
      const fin = new Date(o.fechaEstimada + "T12:00:00").getTime();
      return Math.max((fin - ini) / 86400000, 0);
    });
    const promedio = dias.length ? dias.reduce((s, d) => s + d, 0) / dias.length : 0;

    const porEstado = ESTADOS_OT.map((estado) => ({
      nombre: estado,
      cantidad: visibles.filter((o) => o.estado === estado).length,
    }));

    const porCliente = [...new Set(visibles.map((o) => o.cliente))]
      .map((cliente) => ({ nombre: cliente, cantidad: visibles.filter((o) => o.cliente === cliente).length }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 6);

    const porResponsable = usuarios
      .map((u) => ({
        nombre: u.nombre.split(" ")[0] ?? u.nombre,
        cantidad: activas.filter((o) => o.responsableId === u.id).length,
      }))
      .sort((a, b) => b.cantidad - a.cantidad);

    const porEstadoCot = ESTADOS_COTIZACION.map((estado) => {
      const grupo = cotsVisibles.filter((c) => c.estado === estado);
      return {
        nombre: estado,
        cantidad: grupo.length,
        monto: grupo.reduce((s, c) => s + c.monto, 0),
      };
    });

    const ticketsVisibles = tickets.filter((t) => enRango(t.fecha.slice(0, 10)));
    const ticketsFueraSla = ticketsVisibles.filter(
      (t) => nivelPrimeraRespuesta(t, slaRespuesta) === "Vencido",
    ).length;
    const tiempos = ticketsVisibles
      .map((t) => horasPrimeraRespuesta(t))
      .filter((h): h is number => h !== null);
    const mediaRespuesta = tiempos.length ? tiempos.reduce((s, h) => s + h, 0) / tiempos.length : 0;

    return {
      totalActivas: activas.length,
      vencidas: vencidas.length,
      montoAprobado,
      promedio,
      porEstado,
      porCliente,
      porResponsable,
      porEstadoCot,
      visibles: visibles.length,
      ticketsFueraSla,
      mediaRespuesta,
      ticketsSinResponder: tiempos.length ? ticketsVisibles.length - tiempos.length : ticketsVisibles.length,
    };
  }, [ots, cotizaciones, sla, tickets, slaRespuesta, desde, hasta]);

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
            Indicadores del taller sobre {datos.visibles} OT en el período seleccionado.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2 sm:ml-auto">
          <div className="space-y-1">
            <Label htmlFor="desde" className="text-[11px] text-muted-foreground">
              Desde (ingreso)
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

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          titulo="OT activas"
          valor={String(datos.totalActivas)}
          detalle="Sin contar Terminado ni Facturado"
          icono={LayoutDashboard}
        />
        <Kpi
          titulo="SLA vencido"
          valor={String(datos.vencidas)}
          detalle="OT fuera de plazo según prioridad"
          icono={AlertTriangle}
          tono="text-alta"
        />
        <Kpi
          titulo="Cotizaciones aprobadas"
          valor={formatoMoneda(datos.montoAprobado)}
          detalle="Monto total del período"
          icono={BadgeDollarSign}
        />
        <Kpi
          titulo="Resolución promedio"
          valor={`${datos.promedio.toFixed(1)} días`}
          detalle="Desde ingreso hasta cierre"
          icono={Timer}
        />
        <Kpi
          titulo="Tickets sin responder fuera de SLA"
          valor={String(datos.ticketsFueraSla)}
          detalle={`${datos.ticketsSinResponder} tickets aún sin primera respuesta`}
          icono={Inbox}
          tono="text-alta"
        />
        <Kpi
          titulo="Tiempo medio de primera respuesta"
          valor={`${datos.mediaRespuesta.toFixed(1)} h`}
          detalle="Tickets ya respondidos en el período"
          icono={Clock3}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel titulo="OT por estado">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={datos.porEstado} margin={{ top: 4, right: 8, bottom: 4, left: -18 }}>
              <CartesianGrid stroke={colores.border} vertical={false} />
              <XAxis dataKey="nombre" interval={0} angle={-18} textAnchor="end" height={54} {...ejeComun} />
              <YAxis allowDecimals={false} {...ejeComun} />
              <Tooltip
                contentStyle={estiloTooltip}
              />
              <Bar dataKey="cantidad" name="OT" fill={colores.primary} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel titulo="OT por cliente">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={datos.porCliente} margin={{ top: 4, right: 8, bottom: 4, left: -18 }}>
              <CartesianGrid stroke={colores.border} vertical={false} />
              <XAxis dataKey="nombre" interval={0} angle={-18} textAnchor="end" height={54} {...ejeComun} />
              <YAxis allowDecimals={false} {...ejeComun} />
              <Tooltip
                contentStyle={estiloTooltip}
              />
              <Bar dataKey="cantidad" name="OT" fill={colores.accent} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel titulo="Carga de trabajo por responsable (OT activas)">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={datos.porResponsable}
              layout="vertical"
              margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
            >
              <CartesianGrid stroke={colores.border} horizontal={false} />
              <XAxis type="number" allowDecimals={false} {...ejeComun} />
              <YAxis type="category" dataKey="nombre" width={72} {...ejeComun} />
              <Tooltip
                contentStyle={estiloTooltip}
              />
              <Bar dataKey="cantidad" name="OT activas" fill={colores.primary} radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel titulo="Cotizaciones por estado">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={datos.porEstadoCot} margin={{ top: 4, right: 8, bottom: 4, left: -18 }}>
              <CartesianGrid stroke={colores.border} vertical={false} />
              <XAxis dataKey="nombre" {...ejeComun} />
              <YAxis allowDecimals={false} {...ejeComun} />
              <Tooltip
                formatter={(v: number) => [String(v), "Cotizaciones"]}
                contentStyle={estiloTooltip}
              />
              <Bar dataKey="cantidad" radius={[6, 6, 0, 0]}>
                {datos.porEstadoCot.map((d) => (
                  <Cell key={d.nombre} fill={coloresCot[d.nombre] ?? colores.primary} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {datos.porEstadoCot.map((d) => (
              <li
                key={d.nombre}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs"
              >
                <span className="font-medium">{d.nombre}</span>
                <span className="text-muted-foreground">
                  {d.cantidad} · <span className="font-mono">{formatoMoneda(d.monto)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

    </div>
  );
}
