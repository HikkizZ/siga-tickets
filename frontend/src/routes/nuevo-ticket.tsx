import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { CANALES_TICKET_CREACION, PRIORIDADES, etiquetaCanalTicket, etiquetaPrioridad, type Prioridad } from "@/lib/labels";
import type { CanalTicketCreacion } from "@/lib/api/tickets";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useClientes } from "@/hooks/useClientes";
import { useCrearTicket } from "@/hooks/useTickets";
import { useOTStore } from "@/lib/ot-store";

export const Route = createFileRoute("/nuevo-ticket")({
  head: () => ({
    meta: [
      { title: "Nuevo ticket · Mesa de ayuda · Taller OT" },
      {
        name: "description",
        content:
          "Registra manualmente un ticket recibido por teléfono, de forma presencial o interna, con solicitante, canal y prioridad.",
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
  const { usuario } = useAuth();
  const { abrirTicket } = useOTStore();
  const { data: clientes } = useClientes();
  const crearTicket = useCrearTicket();
  const navigate = useNavigate();

  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [asunto, setAsunto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [canal, setCanal] = useState<CanalTicketCreacion>("telefono");
  const [prioridad, setPrioridad] = useState<Prioridad>("media");
  const [guardando, setGuardando] = useState(false);

  const listo = nombre.trim() !== "" && email.trim() !== "" && asunto.trim() !== "" && descripcion.trim() !== "";

  const alGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listo) return;
    setGuardando(true);
    try {
      const ticket = await crearTicket.mutateAsync({
        asunto: asunto.trim(),
        descripcion: descripcion.trim(),
        solicitanteNombre: nombre.trim(),
        solicitanteEmail: email.trim(),
        ...(telefono.trim() ? { solicitanteTelefono: telefono.trim() } : {}),
        ...(clienteId ? { clienteId } : {}),
        canal,
        prioridad,
      });
      abrirTicket(ticket.id);
      navigate({ to: "/tickets" });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] p-4 sm:p-6">
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <Inbox className="size-5 text-primary" /> Nuevo ticket
      </h1>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Registra una solicitud recibida por teléfono, de forma presencial o desde otra área. Entra como
        “Nuevo” y sin responsable: cualquiera lo puede tomar después desde la bandeja o el detalle.
      </p>

      <form className="mt-5 space-y-4" onSubmit={alGuardar}>
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
          <Campo etiqueta="Cliente (opcional)">
            <Select value={clienteId} onValueChange={setClienteId}>
              <SelectTrigger className="h-10 text-sm">
                <span className={clienteId ? "" : "text-muted-foreground"}>
                  {clientes?.find((c) => c.id === clienteId)?.nombre ?? "Selecciona un cliente"}
                </span>
              </SelectTrigger>
              <SelectContent>
                {(clientes ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nombre}
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
            <Select value={canal} onValueChange={(v) => setCanal(v as CanalTicketCreacion)}>
              <SelectTrigger className="h-10 text-sm">
                <span>{etiquetaCanalTicket(canal)}</span>
              </SelectTrigger>
              <SelectContent>
                {CANALES_TICKET_CREACION.map((c) => (
                  <SelectItem key={c} value={c}>
                    {etiquetaCanalTicket(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
          <Campo etiqueta="Prioridad">
            <Select value={prioridad} onValueChange={(v) => setPrioridad(v as Prioridad)}>
              <SelectTrigger className="h-10 text-sm">
                <span>{etiquetaPrioridad(prioridad)}</span>
              </SelectTrigger>
              <SelectContent>
                {PRIORIDADES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {etiquetaPrioridad(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
        </Seccion>

        <Seccion titulo="Recepción">
          <Campo etiqueta="Recepcionado por">
            <Input value={usuario ? `${usuario.nombre} · ${usuario.rol}` : ""} readOnly className="h-10" />
          </Campo>
          <p className="text-[11px] text-muted-foreground sm:col-span-2">
            El ticket nace sin responsable asignado (nadie lo toma automáticamente, ni siquiera quien lo
            registra); cualquier técnico lo puede tomar después con “Tomar” desde la bandeja o el detalle.
          </p>
        </Seccion>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="h-10" disabled={!listo || guardando}>
            {guardando ? "Creando…" : "Crear ticket"}
          </Button>
          <Button type="button" variant="outline" className="h-10" onClick={() => navigate({ to: "/tickets" })}>
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
