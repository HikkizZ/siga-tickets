import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, Paperclip, Plus, Send } from "lucide-react";
import { PortalLayout } from "@/components/PortalLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useOTStore } from "@/lib/ot-store";
import type { Prioridad } from "@/lib/mock-data";

export const Route = createFileRoute("/mesa-de-ayuda/")({
  head: () => ({
    meta: [
      { title: "Mesa de ayuda · Crear ticket · Taller OT" },
      {
        name: "description",
        content:
          "Envía tu solicitud de soporte a Taller OT: describe el problema, indica su urgencia y recibe un número de ticket para seguirlo.",
      },
      { property: "og:title", content: "Mesa de ayuda · Taller OT" },
      {
        property: "og:description",
        content: "Crea un ticket de soporte y sigue el avance de tu solicitud en línea.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MesaDeAyuda,
});

function MesaDeAyuda() {
  const { crearTicket } = useOTStore();
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [asunto, setAsunto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [prioridad, setPrioridad] = useState<Prioridad>("Media");
  const [adjuntos, setAdjuntos] = useState<string[]>([]);
  const [creado, setCreado] = useState<string | null>(null);

  if (creado) {
    return (
      <PortalLayout accion={{ to: "/mesa-de-ayuda/seguimiento", label: "Consultar un ticket" }}>
        <div className="rounded-xl border border-border bg-card p-6 text-center card-elev sm:p-10">
          <CheckCircle2 className="mx-auto size-10 text-baja" />
          <h1 className="mt-4 text-xl font-semibold tracking-tight">Recibimos tu solicitud</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tu número de ticket es{" "}
            <span className="font-mono font-semibold text-foreground">{creado}</span>. Guárdalo para
            revisar el avance.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Te enviamos una copia a tu correo.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button asChild className="h-10">
              <a href="/mesa-de-ayuda/seguimiento">Ver el estado de mi ticket</a>
            </Button>
            <Button
              variant="outline"
              className="h-10"
              onClick={() => {
                setCreado(null);
                setAsunto("");
                setDescripcion("");
                setAdjuntos([]);
              }}
            >
              Crear otro ticket
            </Button>
          </div>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout accion={{ to: "/mesa-de-ayuda/seguimiento", label: "Consultar un ticket" }}>
      <h1 className="text-2xl font-semibold tracking-tight">¿En qué te ayudamos?</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Cuéntanos qué necesitas y te responderemos por correo con el avance de tu solicitud.
      </p>

      <form
        className="mt-6 space-y-5 rounded-xl border border-border bg-card p-5 card-elev sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (!nombre.trim() || !email.trim() || !asunto.trim()) return;
          const id = crearTicket({
            asunto: asunto.trim(),
            descripcion: descripcion.trim(),
            solicitanteNombre: nombre.trim(),
            solicitanteEmail: email.trim(),
            ...(empresa.trim() ? { empresa: empresa.trim() } : {}),
            prioridad,
            canal: "Portal",
            adjuntos,
          });
          setCreado(id);
        }}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="nombre" className="text-xs">
              Tu nombre
            </Label>
            <Input
              id="nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs">
              Correo
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="empresa" className="text-xs">
              Empresa (opcional)
            </Label>
            <Input
              id="empresa"
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Urgencia sugerida</Label>
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
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="asunto" className="text-xs">
              Asunto
            </Label>
            <Input
              id="asunto"
              value={asunto}
              onChange={(e) => setAsunto(e.target.value)}
              placeholder="Ej: No funciona el control de acceso del ala B"
              required
              className="h-10"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="descripcion" className="text-xs">
              Descripción
            </Label>
            <Textarea
              id="descripcion"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Cuéntanos qué pasó, desde cuándo y dónde…"
              className="min-h-28 text-sm"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Adjuntos (opcional)</Label>
          <div className="flex flex-wrap items-center gap-2">
            {adjuntos.map((a) => (
              <span
                key={a}
                className="inline-flex items-center gap-1.5 rounded border border-border bg-muted px-2 py-1 text-[11px] text-muted-foreground"
              >
                <Paperclip className="size-3" />
                {a}
              </span>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => setAdjuntos((prev) => [...prev, `adjunto-${prev.length + 1}.jpg`])}
            >
              <Plus className="size-4" /> Agregar archivo
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Demostración: los archivos se registran solo como nombre.
          </p>
        </div>

        <Button type="submit" className="h-11 w-full sm:w-auto">
          <Send className="size-4" /> Enviar solicitud
        </Button>
      </form>
    </PortalLayout>
  );
}
