import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Inbox, Paperclip, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  CANALES_TICKET,
  clientes,
  getUsuario,
  usuarioActual,
  usuarios,
  type CanalTicket,
  type Prioridad,
} from "@/lib/mock-data";
import { useOTStore } from "@/lib/ot-store";

export const Route = createFileRoute("/nuevo-ticket")({
  head: () => ({
    meta: [
      { title: "Nuevo ticket · Mesa de ayuda · Taller OT" },
      {
        name: "description",
        content:
          "Registra manualmente un ticket recibido por teléfono, correo, de forma presencial o interna, con solicitante, canal, prioridad y responsable.",
      },
      { property: "og:title", content: "Nuevo ticket · Mesa de ayuda · Taller OT" },
      {
        property: "og:description",
        content: "Formulario interno para ingresar un ticket recibido fuera del portal de la mesa de ayuda.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NuevoTicket,
});

const CANALES_MANUALES = CANALES_TICKET.filter((c) => c !== "Portal");
const ADJUNTOS_DEMO = ["foto-equipo.jpg", "cotizacion-referencia.pdf", "acta-visita.pdf"];

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 card-elev">
      <h2 className="text-sm font-semibold">{titulo}</h2>
      <Separator className="my-4" />
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Campo({
  etiqueta,
  children,
  ancho,
}: {
  etiqueta: string;
  children: React.ReactNode;
  ancho?: boolean;
}) {
  return (
    <div className={ancho ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
      <Label className="text-xs">{etiqueta}</Label>
      {children}
    </div>
  );
}

function NuevoTicket() {
  const { crearTicket, abrirTicket } = useOTStore();
  const navigate = useNavigate();

  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [asunto, setAsunto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [canal, setCanal] = useState<CanalTicket>("Teléfono");
  const [prioridad, setPrioridad] = useState<Prioridad>("Media");
  const [responsable, setResponsable] = useState(usuarioActual.id);
  const [adjuntos, setAdjuntos] = useState<string[]>([]);

  const listo = nombre.trim() !== "" && email.trim() !== "" && asunto.trim() !== "" && descripcion.trim() !== "";

  return (
    <div className="mx-auto max-w-[1200px] p-4 sm:p-6">
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <Inbox className="size-5 text-primary" /> Nuevo ticket
      </h1>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Registra una solicitud recibida por teléfono, correo, de forma presencial o desde otra área. Entra
        como “Nuevo” y el SLA de primera respuesta empieza a contar desde ahora.
      </p>

      <form
        className="mt-5 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!listo) return;
          const id = crearTicket({
            asunto: asunto.trim(),
            descripcion: descripcion.trim(),
            solicitanteNombre: nombre.trim(),
            solicitanteEmail: email.trim(),
            ...(telefono.trim() ? { solicitanteTelefono: telefono.trim() } : {}),
            ...(empresa ? { empresa } : {}),
            prioridad,
            canal,
            adjuntos,
            responsableId: responsable,
          });
          abrirTicket(id);
          navigate({ to: "/tickets" });
        }}
      >
        <Seccion titulo="Solicitante">
          <Campo etiqueta="Nombre">
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej.: Paula Ibáñez"
              className="h-10"
            />
          </Campo>
          <Campo etiqueta="Correo">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@empresa.cl"
              className="h-10"
            />
          </Campo>
          <Campo etiqueta="Teléfono (opcional)">
            <Input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="+56 9 1234 5678"
              className="h-10"
            />
          </Campo>
          <Campo etiqueta="Empresa (opcional)">
            <Select value={empresa} onValueChange={setEmpresa}>
              <SelectTrigger className="h-10 text-sm">
                <span className={empresa ? "" : "text-muted-foreground"}>
                  {empresa || "Selecciona una empresa"}
                </span>
              </SelectTrigger>
              <SelectContent>
                {clientes.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
        </Seccion>

        <Seccion titulo="Solicitud">
          <Campo etiqueta="Asunto" ancho>
            <Input
              value={asunto}
              onChange={(e) => setAsunto(e.target.value)}
              placeholder="Ej.: Falla en tablero de bodega"
              className="h-10"
            />
          </Campo>
          <Campo etiqueta="Descripción" ancho>
            <Textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Detalle de lo que necesita el cliente"
              className="min-h-28 text-sm"
            />
          </Campo>
          <Campo etiqueta="Canal">
            <Select value={canal} onValueChange={(v) => setCanal(v as CanalTicket)}>
              <SelectTrigger className="h-10 text-sm">
                <span>{canal}</span>
              </SelectTrigger>
              <SelectContent>
                {CANALES_MANUALES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
          <Campo etiqueta="Prioridad">
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
          </Campo>
          <Campo etiqueta="Adjuntos (demostración)" ancho>
            <div className="flex flex-wrap items-center gap-2">
              {adjuntos.map((a) => (
                <span
                  key={a}
                  className="inline-flex items-center gap-1.5 rounded border border-border bg-muted px-2 py-1 text-[11px] text-muted-foreground"
                >
                  <Paperclip className="size-3" />
                  {a}
                  <button
                    type="button"
                    onClick={() => setAdjuntos((prev) => prev.filter((x) => x !== a))}
                    aria-label={`Quitar ${a}`}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              {ADJUNTOS_DEMO.filter((a) => !adjuntos.includes(a)).map((a) => (
                <Button
                  key={a}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-[11px]"
                  onClick={() => setAdjuntos((prev) => [...prev, a])}
                >
                  <Plus className="size-3" /> {a}
                </Button>
              ))}
            </div>
          </Campo>
        </Seccion>

        <Seccion titulo="Recepción y responsable">
          <Campo etiqueta="Recepcionado por">
            <Input value={`${usuarioActual.nombre} · ${usuarioActual.rol}`} readOnly className="h-10" />
          </Campo>
          <Campo etiqueta="Responsable inicial">
            <Select value={responsable} onValueChange={setResponsable}>
              <SelectTrigger className="h-10 text-sm">
                <span>{getUsuario(responsable).nombre}</span>
              </SelectTrigger>
              <SelectContent>
                {usuarios.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.nombre} · {u.rol}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
          <p className="text-[11px] text-muted-foreground sm:col-span-2">
            “Recepcionado por” queda fijo con tu usuario. El responsable se puede cambiar después con
            “Derivar” desde el detalle del ticket.
          </p>
        </Seccion>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="h-10" disabled={!listo}>
            Crear ticket
          </Button>
          <Button type="button" variant="outline" className="h-10" onClick={() => navigate({ to: "/tickets" })}>
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
