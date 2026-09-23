import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { EtapasEditor } from "@/components/EtapasEditor";
import { SelectorColaboradores } from "@/components/SelectorColaboradores";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  CATEGORIAS_TRABAJO,
  ORIGENES_TICKET,
  areas,
  clientes,
  usuarioActual,
  usuarios,
  type CategoriaTrabajo,
  type Etapa,
  type OrigenTicket,
  type Prioridad,
} from "@/lib/mock-data";
import { useOTStore } from "@/lib/ot-store";

export const Route = createFileRoute("/nueva-ot")({
  head: () => ({
    meta: [
      { title: "Nueva OT · Taller OT" },
      {
        name: "description",
        content:
          "Formulario para ingresar una orden de trabajo con origen del ticket, solicitante, categoría, fechas y etapas planificadas.",
      },
      { property: "og:title", content: "Nueva OT · Taller OT" },
      {
        property: "og:description",
        content: "Crea una orden de trabajo nueva con su planificación y vuelve a la tabla con el registro agregado.",
      },
    ],
  }),
  component: NuevaOT,
});

function Seccion({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 card-elev sm:p-6">
      <h2 className="text-sm font-semibold tracking-tight">{titulo}</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">{descripcion}</p>
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

function NuevaOT() {
  const { crearOT } = useOTStore();
  const navigate = useNavigate();
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [cliente, setCliente] = useState(clientes[0]!);
  const [prioridad, setPrioridad] = useState<Prioridad>("Media");
  const [responsableId, setResponsableId] = useState(usuarioActual.id);
  const [fechaIngreso, setFechaIngreso] = useState("2026-09-10");
  const [fechaEstimada, setFechaEstimada] = useState("2026-09-30");
  const [origen, setOrigen] = useState<OrigenTicket>("Correo");
  const [interna, setInterna] = useState(false);
  const [area, setArea] = useState(areas[0]!);
  const [solicitanteNombre, setSolicitanteNombre] = useState("");
  const [solicitanteContacto, setSolicitanteContacto] = useState("");
  const [categoria, setCategoria] = useState<CategoriaTrabajo>("Mantención");
  const [ubicacion, setUbicacion] = useState("");
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [colaboradores, setColaboradores] = useState<string[]>([]);


  return (
    <div className="mx-auto w-full max-w-[1200px] p-4 sm:p-6 lg:px-8">
      <Link
        to="/todas-las-ot"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Volver a la tabla
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Nueva orden de trabajo</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Registra de dónde vino el ticket, quién lo pidió y, si quieres, su planificación. La OT queda en
        estado “Ingresado”.
      </p>

      <form
        className="mt-6 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!titulo.trim()) return;
          crearOT({
            titulo: titulo.trim(),
            descripcion: descripcion.trim(),
            cliente: interna ? `Interno · ${area}` : cliente,
            prioridad,
            responsableId,
            fechaIngreso,
            fechaEstimada,
            origen,
            esSolicitudInterna: interna,
            ...(interna ? { area } : {}),
            solicitanteNombre: solicitanteNombre.trim(),
            solicitanteContacto: solicitanteContacto.trim(),
            categoria,
            ubicacion: ubicacion.trim(),
            etapas: etapas.filter((et) => et.nombre.trim() !== ""),
          });
          navigate({ to: "/todas-las-ot" });
        }}
      >
        <Seccion titulo="Trabajo solicitado" descripcion="Qué hay que hacer y con qué urgencia.">
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-1.5 lg:col-span-2">
              <Label htmlFor="titulo" className="text-xs">
                Título
              </Label>
              <Input
                id="titulo"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ej: Mantención de tablero eléctrico"
                required
                className="h-10"
              />
            </div>

            <div className="space-y-1.5 lg:col-span-2">
              <Label htmlFor="descripcion" className="text-xs">
                Descripción
              </Label>
              <Textarea
                id="descripcion"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Detalle del trabajo solicitado…"
                className="min-h-20"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Categoría de trabajo</Label>
              <Select value={categoria} onValueChange={(v) => setCategoria(v as CategoriaTrabajo)}>
                <SelectTrigger className="h-10 text-sm">
                  <span>{categoria}</span>
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS_TRABAJO.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Prioridad</Label>
              <Select value={prioridad} onValueChange={(v) => setPrioridad(v as Prioridad)}>
                <SelectTrigger className="h-10 text-sm">
                  <span>{prioridad}</span>
                </SelectTrigger>
                <SelectContent>
                  {(["Alta", "Media", "Baja"] as Prioridad[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 lg:col-span-2">
              <Label htmlFor="ubicacion" className="text-xs">
                Ubicación del trabajo (opcional)
              </Label>
              <Input
                id="ubicacion"
                value={ubicacion}
                onChange={(e) => setUbicacion(e.target.value)}
                placeholder="Ej: Sala rack, Planta 2, Bodega central"
                className="h-10"
              />
            </div>
          </div>
        </Seccion>

        <Seccion titulo="Origen del ticket" descripcion="Por dónde llegó y quién lo reportó.">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Origen</Label>
              <Select value={origen} onValueChange={(v) => setOrigen(v as OrigenTicket)}>
                <SelectTrigger className="h-10 text-sm">
                  <span>{origen}</span>
                </SelectTrigger>
                <SelectContent>
                  {ORIGENES_TICKET.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/50 px-3.5 py-2.5 sm:mt-6">
              <Label htmlFor="interna" className="text-xs font-normal leading-snug">
                ¿Es una solicitud interna?
              </Label>
              <Switch
                id="interna"
                checked={interna}
                onCheckedChange={(v) => {
                  setInterna(v);
                  if (v) setOrigen("Solicitud interna");
                }}
              />
            </div>

            {interna ? (
              <div className="space-y-1.5">
                <Label className="text-xs">Área/departamento solicitante</Label>
                <Select value={area} onValueChange={setArea}>
                  <SelectTrigger className="h-10 text-sm">
                    <span>{area}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {areas.map((a) => (
                      <SelectItem key={a} value={a}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs">Cliente</Label>
                <Select value={cliente} onValueChange={setCliente}>
                  <SelectTrigger className="h-10 text-sm">
                    <span>{cliente}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="solicitante" className="text-xs">
                Solicitante
              </Label>
              <Input
                id="solicitante"
                value={solicitanteNombre}
                onChange={(e) => setSolicitanteNombre(e.target.value)}
                placeholder="Nombre de quien reportó"
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contacto" className="text-xs">
                Contacto
              </Label>
              <Input
                id="contacto"
                value={solicitanteContacto}
                onChange={(e) => setSolicitanteContacto(e.target.value)}
                placeholder="Teléfono o correo"
                className="h-10"
              />
            </div>
          </div>
        </Seccion>

        <Seccion titulo="Asignación y fechas" descripcion="Responsable del trabajo y plazos comprometidos.">
          <div className="grid gap-5 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Responsable</Label>
              <Select value={responsableId} onValueChange={setResponsableId}>
                <SelectTrigger className="h-10 text-sm">
                  <span>{usuarios.find((u) => u.id === responsableId)?.nombre}</span>
                </SelectTrigger>
                <SelectContent>
                  {usuarios.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nombre} · {u.rol}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ingreso" className="text-xs">
                Fecha de ingreso
              </Label>
              <Input
                id="ingreso"
                type="date"
                value={fechaIngreso}
                onChange={(e) => setFechaIngreso(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="estimada" className="text-xs">
                Fecha estimada
              </Label>
              <Input
                id="estimada"
                type="date"
                value={fechaEstimada}
                onChange={(e) => setFechaEstimada(e.target.value)}
                className="h-10"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Colaboradores (opcional)</Label>
            <SelectorColaboradores
              valor={colaboradores}
              onChange={setColaboradores}
              excluir={responsableId}
            />
            <p className="text-[11px] text-muted-foreground">
              Personas que apoyan el trabajo además del responsable.
            </p>
          </div>
        </Seccion>

        <Seccion
          titulo="Planificación (opcional)"
          descripcion="Agrega etapas o hitos; se mostrarán como mini Gantt en el detalle de la OT."
        >
          <EtapasEditor
            etapas={etapas}
            onChange={setEtapas}
            fechaInicioPorDefecto={fechaIngreso}
            fechaFinPorDefecto={fechaEstimada}
          />
        </Seccion>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="h-10">
            <Save className="size-4" /> Guardar OT
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10"
            onClick={() => navigate({ to: "/todas-las-ot" })}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
