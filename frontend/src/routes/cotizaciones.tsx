import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Link2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { EstadoCotizacionBadge } from "@/components/Prioridad";
import { formatoFecha, formatoMoneda } from "@/lib/mock-data";
import { useOTStore } from "@/lib/ot-store";

export const Route = createFileRoute("/cotizaciones")({
  head: () => ({
    meta: [
      { title: "Cotizaciones · Taller OT" },
      {
        name: "description",
        content:
          "Listado de cotizaciones con cliente, monto, estado y la orden de trabajo vinculada, con filtro por estado.",
      },
      { property: "og:title", content: "Cotizaciones · Taller OT" },
      {
        property: "og:description",
        content: "Controla borradores, cotizaciones enviadas, aprobadas y rechazadas en una sola tabla.",
      },
    ],
  }),
  component: Cotizaciones,
});

function Cotizaciones() {
  const { abrirOT, cotizaciones } = useOTStore();
  const [estado, setEstado] = useState("todos");
  const filtradas = cotizaciones.filter((c) => estado === "todos" || c.estado === estado);
  const total = filtradas.reduce((s, c) => s + c.monto, 0);

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-lg font-semibold">Cotizaciones</h1>
          <p className="text-sm text-muted-foreground">Estado comercial de cada propuesta enviada.</p>
        </div>
        <Select value={estado} onValueChange={setEstado}>
          <SelectTrigger className="ml-auto h-9 w-44 text-sm">
            <span>{estado === "todos" ? "Todos los estados" : estado}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            <SelectItem value="Borrador">Borrador</SelectItem>
            <SelectItem value="Enviada">Enviada</SelectItem>
            <SelectItem value="Aprobada">Aprobada</SelectItem>
            <SelectItem value="Rechazada">Rechazada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-5 overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-2.5 font-medium">Cotización</th>
              <th className="px-5 py-2.5 font-medium">Cliente</th>
              <th className="px-5 py-2.5 font-medium">Fecha</th>
              <th className="px-5 py-2.5 text-right font-medium">Monto</th>
              <th className="px-5 py-2.5 font-medium">Estado</th>
              <th className="px-5 py-2.5 font-medium">OT vinculada</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((c) => (
              <tr key={c.id} className="border-b border-border/70 last:border-0 hover:bg-muted/50">
                <td className="px-5 py-3 font-mono text-xs">{c.id}</td>
                <td className="px-5 py-3">{c.cliente}</td>
                <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{formatoFecha(c.fecha)}</td>
                <td className="px-5 py-3 text-right font-mono text-xs">{formatoMoneda(c.monto)}</td>
                <td className="px-5 py-3">
                  <EstadoCotizacionBadge estado={c.estado} />
                </td>
                <td className="px-5 py-3">
                  {c.otId ? (
                    <button
                      onClick={() => abrirOT(c.otId!)}
                      className="inline-flex items-center gap-1 font-mono text-xs text-primary transition-colors hover:underline"
                    >
                      <Link2 className="size-3" /> {c.otId}
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-secondary/40">
              <td className="px-5 py-2.5 text-xs text-muted-foreground" colSpan={3}>
                {filtradas.length} cotizaciones
              </td>
              <td className="px-5 py-2.5 text-right font-mono text-xs font-semibold">{formatoMoneda(total)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
