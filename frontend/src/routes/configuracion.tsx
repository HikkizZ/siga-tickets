import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Calendar, Check, Settings, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PrioridadBadge } from "@/components/Prioridad";
import { formatoFecha } from "@/lib/mock-data";
import { etiquetaPrioridad, PRIORIDADES, puedeEscribirSla, type Prioridad } from "@/lib/labels";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  useActualizarSlaConfig,
  useCrearFeriado,
  useEliminarFeriado,
  useFeriados,
  useSlaConfig,
} from "@/hooks/useSla";
import type { ActualizarSlaConfigFila, SlaConfigFila } from "@/lib/api/sla";

export const Route = createFileRoute("/configuracion")({
  head: () => ({
    meta: [
      { title: "Configuración de SLA · Taller OT" },
      {
        name: "description",
        content:
          "Define el SLA de resolución y primera respuesta por prioridad, y administra los feriados que pausan el cálculo en horas hábiles.",
      },
      { property: "og:title", content: "Configuración de SLA · Taller OT" },
      {
        property: "og:description",
        content: "Ajusta el SLA por prioridad y el calendario de feriados usado en el cálculo en horas hábiles.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Configuracion,
});

// Un borrador por prioridad, indexado para editar cada fila sin recorrer el arreglo entero.
type Borrador = Record<Prioridad, SlaConfigFila>;

function aBorrador(filas: SlaConfigFila[]): Borrador {
  const mapa = {} as Borrador;
  for (const fila of filas) mapa[fila.prioridad] = fila;
  return mapa;
}

function Configuracion() {
  const { usuario } = useAuth();
  const puedeEscribir = puedeEscribirSla(usuario?.rol ?? "lectura");

  const { data: filas, isLoading, isError } = useSlaConfig();
  const guardarConfig = useActualizarSlaConfig();
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardado, setGuardado] = useState(false);

  // Sincroniza el borrador con lo que devuelve el servidor: al cargar y cada vez que se guarda
  // (la mutación invalida la query y trae los valores ya persistidos).
  useEffect(() => {
    if (filas) setBorrador(aBorrador(filas));
  }, [filas]);

  useEffect(() => {
    if (!guardado) return;
    const t = setTimeout(() => setGuardado(false), 2500);
    return () => clearTimeout(t);
  }, [guardado]);

  const actualizarCampo = <K extends keyof Omit<SlaConfigFila, "prioridad">>(
    prioridad: Prioridad,
    campo: K,
    valor: SlaConfigFila[K],
  ) =>
    setBorrador((prev) =>
      prev ? { ...prev, [prioridad]: { ...prev[prioridad], [campo]: valor } } : prev,
    );

  const guardar = () => {
    if (!borrador) return;
    const configs: ActualizarSlaConfigFila[] = PRIORIDADES.map((p) => borrador[p]);
    guardarConfig.mutate(configs, { onSuccess: () => setGuardado(true) });
  };

  return (
    <div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Settings className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Configuración de SLA</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Plazo de resolución y de primera respuesta por prioridad, en horas.
          </p>
        </div>
      </div>

      {!puedeEscribir && (
        <p className="mt-4 flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          <ShieldAlert className="size-4 shrink-0" />
          Solo un administrador puede modificar el SLA y los feriados. Estás viendo los valores actuales de
          solo lectura.
        </p>
      )}

      {isLoading && <p className="mt-6 text-sm text-muted-foreground">Cargando configuración…</p>}
      {isError && <p className="mt-6 text-sm text-alta">No se pudo cargar la configuración de SLA.</p>}

      {borrador && (
        <>
          <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-card card-elev">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Prioridad</th>
                  <th className="px-4 py-2.5 font-medium">Resolución (h)</th>
                  <th className="px-4 py-2.5 font-medium">Primera respuesta (h)</th>
                  <th className="px-4 py-2.5 font-medium">Horas hábiles</th>
                  <th className="px-4 py-2.5 font-medium">Pausa en espera cliente</th>
                  <th className="px-4 py-2.5 font-medium">Umbral "por vencer"</th>
                </tr>
              </thead>
              <tbody>
                {PRIORIDADES.map((p) => {
                  const fila = borrador[p];
                  return (
                    <tr key={p} className="border-b border-border/70 last:border-0">
                      <td className="px-4 py-3">
                        <PrioridadBadge prioridad={p} />
                      </td>
                      <td className="px-4 py-3">
                        {puedeEscribir ? (
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            value={fila.horasResolucion}
                            onChange={(e) =>
                              actualizarCampo(p, "horasResolucion", Math.max(1, Math.round(Number(e.target.value) || 1)))
                            }
                            className="h-9 w-24"
                            aria-label={`Horas de resolución prioridad ${etiquetaPrioridad(p)}`}
                          />
                        ) : (
                          <span className="font-mono">{fila.horasResolucion}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {puedeEscribir ? (
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            value={fila.horasPrimeraRespuesta}
                            onChange={(e) =>
                              actualizarCampo(
                                p,
                                "horasPrimeraRespuesta",
                                Math.max(1, Math.round(Number(e.target.value) || 1)),
                              )
                            }
                            className="h-9 w-24"
                            aria-label={`Horas de primera respuesta prioridad ${etiquetaPrioridad(p)}`}
                          />
                        ) : (
                          <span className="font-mono">{fila.horasPrimeraRespuesta}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Switch
                          checked={fila.usarHorasHabiles}
                          disabled={!puedeEscribir}
                          onCheckedChange={(v) => actualizarCampo(p, "usarHorasHabiles", v)}
                          aria-label={`Usar horas hábiles prioridad ${etiquetaPrioridad(p)}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Switch
                          checked={fila.pausarEnEsperaCliente}
                          disabled={!puedeEscribir}
                          onCheckedChange={(v) => actualizarCampo(p, "pausarEnEsperaCliente", v)}
                          aria-label={`Pausar en espera cliente prioridad ${etiquetaPrioridad(p)}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        {puedeEscribir ? (
                          <Input
                            type="number"
                            min={0.01}
                            max={1}
                            step={0.05}
                            value={fila.umbralPorVencer}
                            onChange={(e) => {
                              const valor = Number(e.target.value);
                              const acotado = Number.isFinite(valor) ? Math.min(1, Math.max(0.01, valor)) : 0.01;
                              actualizarCampo(p, "umbralPorVencer", acotado);
                            }}
                            className="h-9 w-24"
                            aria-label={`Umbral por vencer prioridad ${etiquetaPrioridad(p)}`}
                          />
                        ) : (
                          <span className="font-mono">{Math.round(fila.umbralPorVencer * 100)}%</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {puedeEscribir && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button className="h-10" onClick={guardar} disabled={guardarConfig.isPending}>
                {guardarConfig.isPending ? "Guardando…" : "Guardar cambios"}
              </Button>
              <Button
                variant="outline"
                className="h-10"
                onClick={() => filas && setBorrador(aBorrador(filas))}
                disabled={guardarConfig.isPending}
              >
                Descartar cambios
              </Button>
              {guardado && (
                <span className="flex items-center gap-1.5 text-sm text-baja">
                  <Check className="size-4" /> Cambios guardados
                </span>
              )}
            </div>
          )}

          <p className="mt-4 text-xs text-muted-foreground">
            "Umbral por vencer" es la fracción final del plazo en la que una OT o ticket pasa a "Por vencer"
            (p. ej. 0,2 = último 20%). Al guardar, el backend recalcula el vencimiento de toda OT/ticket
            abierto de la prioridad editada.
          </p>
        </>
      )}

      <div className="mt-10 flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Calendar className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Feriados</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Días sin horas hábiles para el cálculo de SLA. "Irrenunciable" es solo informativo por ahora.
          </p>
        </div>
      </div>

      <SeccionFeriados puedeEscribir={puedeEscribir} />
    </div>
  );
}

/** Sección de feriados, componente local (no exportado) para no cargar el componente principal —
 * mismo criterio que CadenaResponsablesOt en OTDetail.tsx. */
function SeccionFeriados({ puedeEscribir }: { puedeEscribir: boolean }) {
  const { data: feriados, isLoading, isError } = useFeriados();
  const crear = useCrearFeriado();
  const eliminar = useEliminarFeriado();

  const [fecha, setFecha] = useState("");
  const [nombre, setNombre] = useState("");
  const [irrenunciable, setIrrenunciable] = useState(false);

  const agregar = () => {
    if (!fecha || !nombre.trim()) return;
    crear.mutate(
      { fecha, nombre: nombre.trim(), irrenunciable },
      {
        onSuccess: () => {
          setFecha("");
          setNombre("");
          setIrrenunciable(false);
        },
      },
    );
  };

  return (
    <div className="mt-4">
      <div className="overflow-x-auto rounded-xl border border-border bg-card card-elev">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Fecha</th>
              <th className="px-4 py-2.5 font-medium">Nombre</th>
              <th className="px-4 py-2.5 font-medium">Irrenunciable</th>
              {puedeEscribir && <th className="px-4 py-2.5 font-medium" />}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className="px-4 py-3 text-muted-foreground" colSpan={4}>
                  Cargando feriados…
                </td>
              </tr>
            )}
            {isError && (
              <tr>
                <td className="px-4 py-3 text-alta" colSpan={4}>
                  No se pudieron cargar los feriados.
                </td>
              </tr>
            )}
            {feriados?.length === 0 && (
              <tr>
                <td className="px-4 py-3 text-muted-foreground" colSpan={4}>
                  Sin feriados registrados.
                </td>
              </tr>
            )}
            {feriados?.map((f) => (
              <tr key={f.fecha} className="border-b border-border/70 last:border-0">
                <td className="px-4 py-3 font-mono text-xs">{formatoFecha(f.fecha)}</td>
                <td className="px-4 py-3">{f.nombre}</td>
                <td className="px-4 py-3">{f.irrenunciable ? "Sí" : "No"}</td>
                {puedeEscribir && (
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-alta"
                      disabled={eliminar.isPending}
                      onClick={() => eliminar.mutate(f.fecha)}
                      aria-label={`Eliminar feriado ${f.nombre}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {puedeEscribir && (
        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card card-elev p-3">
          <div className="space-y-1.5">
            <Label htmlFor="feriado-fecha" className="text-xs">
              Fecha
            </Label>
            <Input
              id="feriado-fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="h-9 w-40"
            />
          </div>
          <div className="min-w-40 flex-1 space-y-1.5">
            <Label htmlFor="feriado-nombre" className="text-xs">
              Nombre
            </Label>
            <Input
              id="feriado-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Fiestas Patrias"
              className="h-9"
            />
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Checkbox
              id="feriado-irrenunciable"
              checked={irrenunciable}
              onCheckedChange={(v) => setIrrenunciable(v === true)}
            />
            <Label htmlFor="feriado-irrenunciable" className="text-xs font-normal">
              Irrenunciable
            </Label>
          </div>
          <Button
            className="h-9"
            onClick={agregar}
            disabled={crear.isPending || !fecha || !nombre.trim()}
          >
            Agregar feriado
          </Button>
        </div>
      )}
    </div>
  );
}
