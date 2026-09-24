import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, Calendar, Check, FileText, Flag, GitBranch, Inbox, Mail, Settings, ShieldAlert, Tag, Trash2, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SeccionDepartamentos } from "@/components/configuracion/SeccionDepartamentos";
import { SeccionTemasAyuda } from "@/components/configuracion/SeccionTemasAyuda";
import { SeccionPlanesSla } from "@/components/configuracion/SeccionPlanesSla";
import { SeccionPlantillasCorreo } from "@/components/configuracion/SeccionPlantillasCorreo";
import { SeccionPrioridades } from "@/components/configuracion/SeccionPrioridades";
import { SeccionEstadosTicket } from "@/components/configuracion/SeccionEstadosTicket";
import { SeccionFuentesTicket } from "@/components/configuracion/SeccionFuentesTicket";
import { formatoFecha } from "@/lib/mock-data";
import {
  puedeEscribirCorreoConfig,
  puedeEscribirDepartamentos,
  puedeEscribirEstadosTicket,
  puedeEscribirFuentesTicket,
  puedeEscribirPlanesSla,
  puedeEscribirPlantillasCorreo,
  puedeEscribirPrioridades,
  puedeEscribirSla,
  puedeEscribirTemasAyuda,
} from "@/lib/labels";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useCrearFeriado, useEliminarFeriado, useFeriados } from "@/hooks/useSla";
import { useActualizarCorreoConfig, useCorreoConfig } from "@/hooks/useCorreoConfig";
import type { ActualizarCorreoConfigInput, CorreoConfig } from "@/lib/api/correoConfig";

export const Route = createFileRoute("/configuracion")({
  head: () => ({
    meta: [
      { title: "Configuración · Taller OT" },
      {
        name: "description",
        content:
          "Administra los catálogos de Prioridades, Estados de ticket, Fuentes, SLA y correo del taller.",
      },
      { property: "og:title", content: "Configuración · Taller OT" },
      {
        property: "og:description",
        content: "Catálogos administrables de Tickets/OT, SLA, correo, departamentos y temas de ayuda.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Configuracion,
});

function Configuracion() {
  const { usuario } = useAuth();
  const puedeEscribir = puedeEscribirSla(usuario?.rol ?? "lectura");

  return (
    <div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Settings className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Catálogos administrables de Tickets/OT, SLA y correo.
          </p>
        </div>
      </div>

      <div className="mt-10 flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Flag className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Prioridades</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Catálogo compartido por Ticket y OT. Cada prioridad puede conectarse a un Plan SLA para calcular
            su vencimiento.
          </p>
        </div>
      </div>
      <SeccionPrioridades puedeEscribir={puedeEscribirPrioridades(usuario?.rol ?? "lectura")} />

      <div className="mt-10 flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <GitBranch className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Estados de ticket</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Catálogo con flags de comportamiento (estado inicial, destino al reabrir, pausa de SLA, etc.).
          </p>
        </div>
      </div>
      <SeccionEstadosTicket puedeEscribir={puedeEscribirEstadosTicket(usuario?.rol ?? "lectura")} />

      <div className="mt-10 flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Inbox className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Fuentes de ticket</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Por dónde puede llegar un ticket. Solo las marcadas "manual" se ofrecen al crear un ticket a
            mano.
          </p>
        </div>
      </div>
      <SeccionFuentesTicket puedeEscribir={puedeEscribirFuentesTicket(usuario?.rol ?? "lectura")} />

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

      <div className="mt-10 flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Mail className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Correo</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Buzón entrante (IMAP) y correo saliente (SMTP) que usa el worker de ingesta y de envío.
          </p>
        </div>
      </div>

      <SeccionCorreo puedeEscribir={puedeEscribirCorreoConfig(usuario?.rol ?? "lectura")} />

      <div className="mt-10 flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Building2 className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Departamentos</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Catálogo simple de departamentos, usado como sugerencia en los temas de ayuda.
          </p>
        </div>
      </div>
      <SeccionDepartamentos puedeEscribir={puedeEscribirDepartamentos(usuario?.rol ?? "lectura")} />

      <div className="mt-10 flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Tag className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Temas de ayuda</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Clasificación opcional para "Nuevo ticket", sin efecto automático sobre prioridad ni SLA.
          </p>
        </div>
      </div>
      <SeccionTemasAyuda puedeEscribir={puedeEscribirTemasAyuda(usuario?.rol ?? "lectura")} />

      <div className="mt-10 flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Timer className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Planes SLA</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Catálogo con nombre propio. Cada Prioridad (arriba) puede conectarse a uno para calcular su SLA.
          </p>
        </div>
      </div>
      <SeccionPlanesSla puedeEscribir={puedeEscribirPlanesSla(usuario?.rol ?? "lectura")} />

      <div className="mt-10 flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <FileText className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Plantillas de correo</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Asunto y cuerpo (HTML con placeholders) de los 3 correos salientes automáticos.
          </p>
        </div>
      </div>
      <SeccionPlantillasCorreo puedeEscribir={puedeEscribirPlantillasCorreo(usuario?.rol ?? "lectura")} />
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

// Borrador editable de la config de correo (docs/api.md, sección "Configuración de correo (Fase
// A)"). Los campos numéricos se guardan como string (valor crudo del Input) y se convierten recién
// al construir el PUT; los de contraseña son propios del borrador (no existen en CorreoConfig, que
// nunca trae la contraseña real) y arrancan vacíos siempre, sin importar si ya hay una guardada.
type CorreoBorrador = {
  imapHost: string;
  imapPort: string;
  imapUser: string;
  imapPassword: string;
  imapFolder: string;
  imapTls: boolean;
  imapHabilitado: boolean;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPassword: string;
  smtpTls: boolean;
  smtpHabilitado: boolean;
  correoDesde: string;
  dominio: string;
};

function aCorreoBorrador(config: CorreoConfig): CorreoBorrador {
  return {
    imapHost: config.imapHost ?? "",
    imapPort: config.imapPort !== null ? String(config.imapPort) : "",
    imapUser: config.imapUser ?? "",
    imapPassword: "",
    imapFolder: config.imapFolder ?? "",
    imapTls: config.imapTls,
    imapHabilitado: config.imapHabilitado,
    smtpHost: config.smtpHost ?? "",
    smtpPort: config.smtpPort !== null ? String(config.smtpPort) : "",
    smtpUser: config.smtpUser ?? "",
    smtpPassword: "",
    smtpTls: config.smtpTls,
    smtpHabilitado: config.smtpHabilitado,
    correoDesde: config.correoDesde ?? "",
    dominio: config.dominio ?? "",
  };
}

// Solo arma los campos que cambiaron respecto a lo último cargado del servidor: PUT /correo/config
// es parcial (solo se actualiza lo enviado), así que un guardado que solo tocó, p. ej., el puerto
// nunca debe mandar (ni por lo tanto pisar) la contraseña ya guardada. Los puertos vacíos se
// ignoran (no se manda un puerto inválido); las contraseñas solo se mandan si el usuario escribió
// algo nuevo en esta sesión de edición.
function construirCambiosCorreo(config: CorreoConfig, borrador: CorreoBorrador): ActualizarCorreoConfigInput {
  const cambios: ActualizarCorreoConfigInput = {};

  if (borrador.imapHost !== (config.imapHost ?? "")) cambios.imapHost = borrador.imapHost;
  if (borrador.imapUser !== (config.imapUser ?? "")) cambios.imapUser = borrador.imapUser;
  if (borrador.imapFolder !== (config.imapFolder ?? "")) cambios.imapFolder = borrador.imapFolder;
  if (borrador.imapTls !== config.imapTls) cambios.imapTls = borrador.imapTls;
  if (borrador.imapHabilitado !== config.imapHabilitado) cambios.imapHabilitado = borrador.imapHabilitado;
  if (borrador.imapPassword.trim() !== "") cambios.imapPassword = borrador.imapPassword;
  if (borrador.imapPort.trim() !== "") {
    const puerto = Number(borrador.imapPort);
    if (puerto !== config.imapPort) cambios.imapPort = puerto;
  }

  if (borrador.smtpHost !== (config.smtpHost ?? "")) cambios.smtpHost = borrador.smtpHost;
  if (borrador.smtpUser !== (config.smtpUser ?? "")) cambios.smtpUser = borrador.smtpUser;
  if (borrador.smtpTls !== config.smtpTls) cambios.smtpTls = borrador.smtpTls;
  if (borrador.smtpHabilitado !== config.smtpHabilitado) cambios.smtpHabilitado = borrador.smtpHabilitado;
  if (borrador.smtpPassword.trim() !== "") cambios.smtpPassword = borrador.smtpPassword;
  if (borrador.smtpPort.trim() !== "") {
    const puerto = Number(borrador.smtpPort);
    if (puerto !== config.smtpPort) cambios.smtpPort = puerto;
  }

  if (borrador.correoDesde !== (config.correoDesde ?? "")) cambios.correoDesde = borrador.correoDesde;
  if (borrador.dominio !== (config.dominio ?? "")) cambios.dominio = borrador.dominio;

  return cambios;
}

/** Campo de texto/número: Input editable o texto plano de solo lectura, mismo criterio que la
 * tabla de SLA (columnas numéricas condicionan Input vs `<span>` según `puedeEscribir`). */
function CampoCorreoTexto({
  id,
  label,
  value,
  onChange,
  puedeEscribir,
  type = "text",
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (valor: string) => void;
  puedeEscribir: boolean;
  type?: "text" | "number";
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {puedeEscribir ? (
        <Input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-9"
        />
      ) : (
        <p className="flex h-9 items-center text-sm">
          {value || <span className="text-muted-foreground">—</span>}
        </p>
      )}
    </div>
  );
}

/** Campo de contraseña: nunca se prellena con nada real (el backend nunca la devuelve). Si ya hay
 * una guardada (`tieneGuardada`), el placeholder lo indica; el campo arranca vacío y solo se manda
 * en el PUT si el usuario escribe algo nuevo (ver `construirCambiosCorreo`). */
function CampoCorreoPassword({
  id,
  label,
  value,
  onChange,
  puedeEscribir,
  tieneGuardada,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (valor: string) => void;
  puedeEscribir: boolean;
  tieneGuardada: boolean;
}) {
  const textoEstado = tieneGuardada ? "•••••••• (ya configurada)" : "Sin configurar";
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {puedeEscribir ? (
        <Input
          id={id}
          type="password"
          autoComplete="new-password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={textoEstado}
          className="h-9"
        />
      ) : (
        <p className="flex h-9 items-center text-sm text-muted-foreground">{textoEstado}</p>
      )}
    </div>
  );
}

function CampoCorreoSwitch({
  id,
  label,
  checked,
  onCheckedChange,
  puedeEscribir,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (valor: boolean) => void;
  puedeEscribir: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Switch id={id} checked={checked} disabled={!puedeEscribir} onCheckedChange={onCheckedChange} aria-label={label} />
      <Label htmlFor={id} className="text-xs font-normal">
        {label}
      </Label>
    </div>
  );
}

/** Un bloque (IMAP o SMTP): host/puerto/usuario/contraseña (+carpeta solo IMAP) y los switches
 * TLS/Habilitado. `idPrefix` evita colisión de ids entre los dos bloques en el mismo formulario. */
function BloqueCorreo({
  idPrefix,
  titulo,
  puedeEscribir,
  tienePassword,
  host,
  onHost,
  puerto,
  onPuerto,
  usuarioCorreo,
  onUsuarioCorreo,
  password,
  onPassword,
  tls,
  onTls,
  habilitado,
  onHabilitado,
  carpeta,
  onCarpeta,
}: {
  idPrefix: string;
  titulo: string;
  puedeEscribir: boolean;
  tienePassword: boolean;
  host: string;
  onHost: (v: string) => void;
  puerto: string;
  onPuerto: (v: string) => void;
  usuarioCorreo: string;
  onUsuarioCorreo: (v: string) => void;
  password: string;
  onPassword: (v: string) => void;
  tls: boolean;
  onTls: (v: boolean) => void;
  habilitado: boolean;
  onHabilitado: (v: boolean) => void;
  carpeta?: string;
  onCarpeta?: (v: string) => void;
}) {
  // Placeholders de ejemplo distintos por bloque (docs/api.md trae "imap.sigaltda.cl"/993 para
  // IMAP y "smtp.sigaltda.cl"/587 para SMTP en el mismo ejemplo).
  const esImap = idPrefix === "imap";
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card card-elev p-4">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CampoCorreoTexto
          id={`${idPrefix}-host`}
          label="Host"
          value={host}
          onChange={onHost}
          puedeEscribir={puedeEscribir}
          placeholder={esImap ? "imap.sigaltda.cl" : "smtp.sigaltda.cl"}
        />
        <CampoCorreoTexto
          id={`${idPrefix}-puerto`}
          label="Puerto"
          type="number"
          value={puerto}
          onChange={onPuerto}
          puedeEscribir={puedeEscribir}
          placeholder={esImap ? "993" : "587"}
        />
        <CampoCorreoTexto
          id={`${idPrefix}-usuario`}
          label="Usuario"
          value={usuarioCorreo}
          onChange={onUsuarioCorreo}
          puedeEscribir={puedeEscribir}
          placeholder="soporte@sigaltda.cl"
        />
        <CampoCorreoPassword
          id={`${idPrefix}-password`}
          label="Contraseña"
          value={password}
          onChange={onPassword}
          puedeEscribir={puedeEscribir}
          tieneGuardada={tienePassword}
        />
        {carpeta !== undefined && onCarpeta && (
          <CampoCorreoTexto
            id={`${idPrefix}-carpeta`}
            label="Carpeta"
            value={carpeta}
            onChange={onCarpeta}
            puedeEscribir={puedeEscribir}
            placeholder="INBOX"
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-6 pt-1">
        <CampoCorreoSwitch id={`${idPrefix}-tls`} label="TLS" checked={tls} onCheckedChange={onTls} puedeEscribir={puedeEscribir} />
        <CampoCorreoSwitch
          id={`${idPrefix}-habilitado`}
          label="Habilitado"
          checked={habilitado}
          onCheckedChange={onHabilitado}
          puedeEscribir={puedeEscribir}
        />
      </div>
    </div>
  );
}

/** Sección de correo (Fase A), componente local (no exportado) — mismo criterio que
 * SeccionFeriados: no cargar el componente principal con el estado propio de esta subsección. */
function SeccionCorreo({ puedeEscribir }: { puedeEscribir: boolean }) {
  const { data: config, isLoading, isError } = useCorreoConfig();
  const guardarConfig = useActualizarCorreoConfig();
  const [borrador, setBorrador] = useState<CorreoBorrador | null>(null);
  const [guardado, setGuardado] = useState(false);

  // Sincroniza el borrador con lo que devuelve el servidor: al cargar y cada vez que se guarda (la
  // mutación invalida la query y trae los valores ya persistidos) — mismo criterio que la tabla de
  // SLA. Como efecto colateral correcto, esto también limpia los campos de contraseña recién
  // escritos después de guardar, porque el GET nunca los trae de vuelta.
  useEffect(() => {
    if (config) setBorrador(aCorreoBorrador(config));
  }, [config]);

  useEffect(() => {
    if (!guardado) return;
    const t = setTimeout(() => setGuardado(false), 2500);
    return () => clearTimeout(t);
  }, [guardado]);

  const actualizarCampo = <K extends keyof CorreoBorrador>(campo: K, valor: CorreoBorrador[K]) =>
    setBorrador((prev) => (prev ? { ...prev, [campo]: valor } : prev));

  const guardar = () => {
    if (!borrador || !config) return;
    const cambios = construirCambiosCorreo(config, borrador);
    guardarConfig.mutate(cambios, { onSuccess: () => setGuardado(true) });
  };

  if (isLoading) return <p className="mt-4 text-sm text-muted-foreground">Cargando configuración de correo…</p>;
  if (isError || !borrador || !config)
    return <p className="mt-4 text-sm text-alta">No se pudo cargar la configuración de correo.</p>;

  return (
    <div className="mt-4 space-y-4">
      {!puedeEscribir && (
        <p className="flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          <ShieldAlert className="size-4 shrink-0" />
          Solo un administrador puede modificar el buzón de correo. Estás viendo los valores actuales de solo
          lectura.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BloqueCorreo
          idPrefix="imap"
          titulo="Buzón entrante (IMAP)"
          puedeEscribir={puedeEscribir}
          tienePassword={config.tieneImapPassword}
          host={borrador.imapHost}
          onHost={(v) => actualizarCampo("imapHost", v)}
          puerto={borrador.imapPort}
          onPuerto={(v) => actualizarCampo("imapPort", v)}
          usuarioCorreo={borrador.imapUser}
          onUsuarioCorreo={(v) => actualizarCampo("imapUser", v)}
          password={borrador.imapPassword}
          onPassword={(v) => actualizarCampo("imapPassword", v)}
          tls={borrador.imapTls}
          onTls={(v) => actualizarCampo("imapTls", v)}
          habilitado={borrador.imapHabilitado}
          onHabilitado={(v) => actualizarCampo("imapHabilitado", v)}
          carpeta={borrador.imapFolder}
          onCarpeta={(v) => actualizarCampo("imapFolder", v)}
        />
        <BloqueCorreo
          idPrefix="smtp"
          titulo="Correo saliente (SMTP)"
          puedeEscribir={puedeEscribir}
          tienePassword={config.tieneSmtpPassword}
          host={borrador.smtpHost}
          onHost={(v) => actualizarCampo("smtpHost", v)}
          puerto={borrador.smtpPort}
          onPuerto={(v) => actualizarCampo("smtpPort", v)}
          usuarioCorreo={borrador.smtpUser}
          onUsuarioCorreo={(v) => actualizarCampo("smtpUser", v)}
          password={borrador.smtpPassword}
          onPassword={(v) => actualizarCampo("smtpPassword", v)}
          tls={borrador.smtpTls}
          onTls={(v) => actualizarCampo("smtpTls", v)}
          habilitado={borrador.smtpHabilitado}
          onHabilitado={(v) => actualizarCampo("smtpHabilitado", v)}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card card-elev p-4 sm:grid-cols-2">
        <CampoCorreoTexto
          id="correo-desde"
          label="Remitente"
          value={borrador.correoDesde}
          onChange={(v) => actualizarCampo("correoDesde", v)}
          puedeEscribir={puedeEscribir}
          placeholder="Soporte <soporte@sigaltda.cl>"
        />
        <CampoCorreoTexto
          id="correo-dominio"
          label="Dominio"
          value={borrador.dominio}
          onChange={(v) => actualizarCampo("dominio", v)}
          puedeEscribir={puedeEscribir}
          placeholder="sigaltda.cl"
        />
      </div>

      {puedeEscribir && (
        <div className="flex flex-wrap items-center gap-3">
          <Button className="h-10" onClick={guardar} disabled={guardarConfig.isPending}>
            {guardarConfig.isPending ? "Guardando…" : "Guardar cambios"}
          </Button>
          <Button
            variant="outline"
            className="h-10"
            onClick={() => config && setBorrador(aCorreoBorrador(config))}
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

      <p className="text-xs text-muted-foreground">
        "Remitente" es el nombre y correo que verán los destinatarios (encabezado <code>From</code>);
        "Dominio" se usa para construir el <code>Message-ID</code> de los correos salientes. La contraseña
        nunca se muestra: el campo arranca vacío y solo se actualiza si escribes una nueva.
      </p>
    </div>
  );
}
