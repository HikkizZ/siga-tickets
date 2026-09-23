import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  Building2,
  ChevronDown,
  FileText,
  Inbox,
  KanbanSquare,
  KeyRound,
  GanttChartSquare,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Rows3,
  Search,
  Settings,
  User,
  Wrench,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { formatoMoneda } from "@/lib/mock-data";
import { useOTStore } from "@/lib/ot-store";
import { OTDetail } from "@/components/OTDetail";
import { useAuth } from "@/lib/auth/AuthProvider";
import { etiquetaEstadoCotizacion, etiquetaEstadoOt, etiquetaEstadoTicket, etiquetaRol } from "@/lib/labels";
import { useUsuarios } from "@/hooks/useUsuarios";
import { useClientes } from "@/hooks/useClientes";
import { useDebounced } from "@/hooks/useDebounced";
import { useBuscar } from "@/hooks/useBuscar";
import { useDashboard } from "@/hooks/useDashboard";
import {
  useMarcarNotificacionLeida,
  useMarcarTodasNotificacionesLeidas,
  useNotificaciones,
  useNotificacionesNoLeidasTotal,
  useResumenNotificaciones,
} from "@/hooks/useNotificaciones";
import type { Notificacion as NotificacionReal } from "@/lib/api/notificaciones";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/", label: "Tablero", icon: KanbanSquare },
  { to: "/todas-las-ot", label: "Todas las OT", icon: Rows3 },
  { to: "/linea-de-tiempo", label: "Línea de tiempo", icon: GanttChartSquare },
  { to: "/tickets", label: "Tickets", icon: Inbox },
  { to: "/cotizaciones", label: "Cotizaciones", icon: FileText },
  { to: "/clientes", label: "Clientes", icon: Building2 },
  { to: "/configuracion", label: "Configuración", icon: Settings },
];

/** Fecha relativa simple ("hace 12 min") para el timestamp real de cada notificación — el mock
 * traía la fecha ya como texto ("hace 12 min"), el backend entrega `creadoEn` en ISO. */
function fechaRelativa(iso: string): string {
  const minutos = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutos < 1) return "hace unos segundos";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  return `hace ${Math.round(horas / 24)} d`;
}

function Notificaciones() {
  const { abrirOT, abrirTicket } = useOTStore();
  const navigate = useNavigate();
  const { data: lista } = useNotificaciones({ perPage: 20 });
  const { data: noLeidas = 0 } = useNotificacionesNoLeidasTotal();
  const marcarLeida = useMarcarNotificacionLeida();
  const marcarTodas = useMarcarTodasNotificacionesLeidas();

  // Clic en una notificación: si no estaba leída, se marca; si apunta a una OT o un ticket
  // (derivación, sla_por_vencer, sla_vencida), abre esa entidad. Otros tipos (p. ej.
  // correo_fallido) solo se marcan como leídos, sin navegación.
  const alHacerClic = (n: NotificacionReal) => {
    if (n.leidaEn === null) marcarLeida.mutate(n.id);
    if (n.entidadTipo === "ot") abrirOT(n.entidadId);
    else if (n.entidadTipo === "ticket") {
      abrirTicket(n.entidadId);
      navigate({ to: "/tickets" });
    }
  };

  return (
    <Popover>
      <PopoverTrigger className="relative flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
        <Bell className="size-[18px]" />
        {noLeidas > 0 && (
          <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-alta text-[10px] font-semibold text-primary-foreground">
            {noLeidas > 9 ? "9+" : noLeidas}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold">Notificaciones</span>
          <button
            onClick={() => marcarTodas.mutate()}
            disabled={marcarTodas.isPending || noLeidas === 0}
            className="text-xs text-primary transition-colors hover:underline disabled:pointer-events-none disabled:opacity-40"
          >
            Marcar todas como leídas
          </button>
        </div>
        <Separator />
        <ul className="max-h-80 overflow-y-auto">
          {lista?.items.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">Sin notificaciones.</li>
          )}
          {lista?.items.map((n) => {
            const noLeida = n.leidaEn === null;
            return (
              <li key={n.id} className={cn("border-b border-border last:border-0", noLeida && "bg-accent/50")}>
                <button
                  onClick={() => alHacerClic(n)}
                  className="flex w-full gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-accent/60"
                >
                  <span
                    className={cn("mt-1.5 size-2 shrink-0 rounded-full", noLeida ? "bg-primary" : "bg-border")}
                  />
                  <div className="min-w-0">
                    <p className={cn("leading-snug", noLeida && "font-medium")}>{n.titulo}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.cuerpo}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{fechaRelativa(n.creadoEn)}</p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function NavItems({
  colapsado,
  onNavigate,
}: {
  colapsado: boolean;
  onNavigate?: (() => void) | undefined;
}) {
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="flex flex-col gap-1 px-2 py-2">
      {nav.map((item) => {
        const activo = item.to === "/" ? path === "/" : path.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            title={colapsado ? item.label : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              colapsado && "justify-center px-0",
              activo
                ? "bg-nav-active font-semibold text-nav-foreground"
                : "text-nav-muted hover:bg-nav-active/50 hover:text-nav-foreground",
            )}
          >
            {activo && (
              <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r bg-primary" />
            )}
            <item.icon className={cn("size-[18px] shrink-0", activo && "text-primary")} />
            {!colapsado && <span className="truncate">{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarContenido({
  colapsado,
  onToggle,
  onNavigate,
}: {
  colapsado: boolean;
  onToggle?: (() => void) | undefined;
  onNavigate?: (() => void) | undefined;
}) {
  // otActivas/otConSlaVencido son "foto actual" en GET /dashboard (docs/api.md, Fase 6) — mismos
  // dos números que ya mostraba este panel, ahora reales en vez de contar el arreglo mock entero
  // (el mock ni siquiera filtraba "activas" de verdad: mostraba el total de OT, cerradas incluidas).
  const { data: resumen } = useDashboard();

  return (
    <div className="flex h-full flex-col bg-nav text-nav-foreground">
      <div className={cn("flex items-center gap-2.5 px-4 py-5", colapsado && "justify-center px-0")}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary">
          <Wrench className="size-4 text-primary-foreground" />
        </span>
        {!colapsado && (
          <div className="leading-tight">
            <p className="text-sm font-semibold">Taller OT</p>
            <p className="text-[11px] text-nav-muted">Seguimiento interno</p>
          </div>
        )}
      </div>
      <Separator className="bg-nav-active" />
      <NavItems colapsado={colapsado} onNavigate={onNavigate} />
      <div className="mt-auto space-y-3 px-3 py-4">
        {!colapsado && resumen && (
          <div className="rounded-md bg-nav-active/60 px-3 py-2 text-[11px] text-nav-muted">
            <p className="font-mono">{resumen.otActivas} OT activas</p>
            {resumen.otConSlaVencido > 0 && (
              <p className="mt-1 text-alta-suave">{resumen.otConSlaVencido} con SLA vencido</p>
            )}
          </div>
        )}
        {onToggle && (
          <button
            onClick={onToggle}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-xs text-nav-muted transition-colors hover:bg-nav-active/50 hover:text-nav-foreground",
              colapsado && "justify-center px-0",
            )}
          >
            {colapsado ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            {!colapsado && "Colapsar menú"}
          </button>
        )}
      </div>
    </div>
  );
}

/** "Felipe Miranda" → "FM" (mismo criterio que usaban las iniciales fijas del mock). */
function iniciales(nombre: string): string {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? "")
    .join("");
}

/** Demuestra que el cliente de red + auth funcionan de punta a punta (GET /usuarios, GET
 * /clientes reales) sin tocar ninguna pantalla de negocio: solo lectura, dentro del popover
 * de perfil, que ya es de bajo riesgo y no forma parte del tablero/OT/tickets. */
function UsuariosYClientesReales() {
  const { usuario: usuarioActual } = useAuth();
  const esAdmin = usuarioActual?.rol === "admin";
  const usuarios = useUsuarios();
  const clientes = useClientes();

  return (
    <div className="space-y-2 rounded-lg border border-border bg-secondary/40 p-3 text-sm">
      <p className="text-xs font-medium text-muted-foreground">Datos reales del backend (Fase 0)</p>
      <div className="flex justify-between gap-3">
        <dt className="text-muted-foreground">Usuarios</dt>
        <dd className="font-mono text-xs">
          {/* GET /usuarios es admin-only en el backend (docs/api.md): para cualquier otro rol,
              useUsuarios() ni siquiera dispara la llamada (useUsuarios.ts) — "solo admin" en vez
              de mostrar "0", que daría a entender que de verdad no hay usuarios. */}
          {!esAdmin
            ? "solo admin"
            : usuarios.isLoading
              ? "cargando…"
              : usuarios.isError
                ? "error"
                : `${usuarios.data?.length ?? 0}`}
        </dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="text-muted-foreground">Clientes</dt>
        <dd className="font-mono text-xs">
          {clientes.isLoading ? "cargando…" : clientes.isError ? "error" : `${clientes.data?.length ?? 0}`}
        </dd>
      </div>
    </div>
  );
}

function MenuPerfil() {
  const navigate = useNavigate();
  const { usuario, logout } = useAuth();
  const [perfil, setPerfil] = useState(false);
  const [clave, setClave] = useState(false);

  if (!usuario) return null;
  const nombreCorto = usuario.nombre.split(" ")[0];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          <span className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
            {iniciales(usuario.nombre)}
          </span>
          <span className="hidden text-left leading-tight lg:block">
            <span className="block text-xs font-medium">{usuario.nombre}</span>
            <span className="block text-[11px] text-muted-foreground">{etiquetaRol(usuario.rol)}</span>
          </span>
          <ChevronDown className="hidden size-3.5 text-muted-foreground lg:block" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Sesión de {nombreCorto}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setPerfil(true)}>
            <User className="size-4" /> Mi perfil
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setClave(true)}>
            <KeyRound className="size-4" /> Cambiar contraseña
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              if (typeof window !== "undefined") sessionStorage.removeItem("resumen-visto");
              logout();
              navigate({ to: "/login" });
            }}
          >
            <LogOut className="size-4" /> Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={perfil} onOpenChange={setPerfil}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Mi perfil</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
              {iniciales(usuario.nombre)}
            </span>
            <div>
              <p className="font-medium">{usuario.nombre}</p>
              <p className="text-sm text-muted-foreground">{usuario.cargo ?? etiquetaRol(usuario.rol)}</p>
            </div>
          </div>
          <dl className="space-y-2 rounded-lg border border-border bg-secondary/40 p-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Correo</dt>
              <dd className="truncate font-mono text-xs">{usuario.email}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Rol</dt>
              <dd>{etiquetaRol(usuario.rol)}</dd>
            </div>
          </dl>
          <UsuariosYClientesReales />
        </DialogContent>
      </Dialog>

      <Dialog open={clave} onOpenChange={setClave}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Cambiar contraseña</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              setClave(false);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="actual" className="text-xs">
                Contraseña actual
              </Label>
              <Input id="actual" type="password" placeholder="••••••••" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nueva" className="text-xs">
                Nueva contraseña
              </Label>
              <Input id="nueva" type="password" placeholder="••••••••" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmar" className="text-xs">
                Confirmar nueva contraseña
              </Label>
              <Input id="confirmar" type="password" placeholder="••••••••" className="h-10" />
            </div>
            <Button type="submit" className="h-10 w-full">
              Guardar contraseña
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

type ClaveResumen =
  | "otVencidas"
  | "otPrioridadAltaAbiertas"
  | "otPendientesCotizarOAprobar"
  | "ticketsNuevosSinResponder";

function ResumenInicio() {
  const { abrirOT, abrirTicket } = useOTStore();
  const navigate = useNavigate();
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("mostrar-resumen") !== "1") return;
    sessionStorage.removeItem("mostrar-resumen");
    setAbierto(true);
  }, []);

  // Solo se pide GET /notificaciones/resumen cuando el diálogo se va a mostrar (no en cada carga
  // de la app): "habilitado" en useResumenNotificaciones controla el `enabled` de la query.
  const { data: resumen } = useResumenNotificaciones(abierto);

  const irAItem = (clave: ClaveResumen, id: string) => {
    setAbierto(false);
    if (clave === "ticketsNuevosSinResponder") {
      abrirTicket(id);
      navigate({ to: "/tickets" });
    } else {
      abrirOT(id);
    }
  };

  const hoy = new Date()
    .toLocaleDateString("es-CL", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })
    .replace(",", "");

  const filas: { clave: ClaveResumen; bloque: { total: number; items: { id: string; numero: string }[] } | undefined; texto: string; tono: string }[] = [
    { clave: "otVencidas", bloque: resumen?.otVencidas, texto: "OT con SLA vencido", tono: "text-alta" },
    {
      clave: "otPrioridadAltaAbiertas",
      bloque: resumen?.otPrioridadAltaAbiertas,
      texto: "OT de prioridad alta abiertas",
      tono: "text-media",
    },
    {
      clave: "otPendientesCotizarOAprobar",
      bloque: resumen?.otPendientesCotizarOAprobar,
      texto: "OT pendientes por cotizar o aprobar",
      tono: "text-foreground",
    },
    {
      clave: "ticketsNuevosSinResponder",
      bloque: resumen?.ticketsNuevosSinResponder,
      texto: "tickets nuevos sin responder",
      tono: "text-primary",
    },
  ];

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Resumen del día · {hoy}</DialogTitle>
        </DialogHeader>
        <p className="-mt-2 text-xs text-muted-foreground">
          Panorama de todo el equipo, no solo lo tuyo.
        </p>
        {!resumen ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <ul className="space-y-2">
            {filas.map((f) => (
              <li key={f.texto} className="rounded-md border border-border bg-card px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <span className={cn("w-8 text-right font-mono text-lg font-semibold", f.tono)}>
                    {f.bloque?.total ?? 0}
                  </span>
                  <span className="text-sm text-muted-foreground">{f.texto}</span>
                </div>
                {f.bloque && f.bloque.items.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5 pl-11">
                    {f.bloque.items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => irAItem(f.clave, item.id)}
                        className="rounded border border-border bg-secondary/50 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                      >
                        {item.numero}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <Button onClick={() => setAbierto(false)} className="w-full">
          Ir al tablero
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function BuscadorGlobal() {
  const { abrirOT, abrirTicket } = useOTStore();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const qDebounced = useDebounced(q, 300);
  const abierto = q.trim().length >= 2;
  const { data, isFetching } = useBuscar(qDebounced);

  const otsEncontradas = data?.ots ?? [];
  const ticketsEncontrados = data?.tickets ?? [];
  const cotizacionesEncontradas = data?.cotizaciones ?? [];
  const clientesEncontrados = data?.clientes ?? [];
  const total = otsEncontradas.length + ticketsEncontrados.length + cotizacionesEncontradas.length + clientesEncontrados.length;
  // El debounce deja un instante en que `q` ya califica pero `qDebounced` (y por lo tanto `data`)
  // todavía es el de la búsqueda anterior — se muestra "Buscando…" en vez de un "Sin resultados"
  // engañoso mientras tanto.
  const buscando = abierto && (isFetching || qDebounced.trim() !== q.trim());

  const Grupo = ({ titulo, children }: { titulo: string; children: ReactNode }) => (
    <div className="py-1.5">
      <p className="px-3 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">{titulo}</p>
      {children}
    </div>
  );

  const Fila = ({
    principal,
    secundario,
    onSelect,
  }: {
    principal: string;
    secundario: string;
    onSelect?: () => void;
  }) => {
    const contenido = (
      <>
        {principal && <span className="font-mono text-[11px] text-muted-foreground">{principal}</span>}
        <span className="truncate">{secundario}</span>
      </>
    );
    if (!onSelect) {
      // Cliente: sin pantalla de detalle propia en la app (ver docs/frontend-diseno.md, Fase 6) —
      // se muestra el resultado sin acción de clic, en vez de inventar una navegación.
      return <div className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground">{contenido}</div>;
    }
    return (
      <button
        onMouseDown={() => {
          onSelect();
          setQ("");
        }}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent/60"
      >
        {contenido}
      </button>
    );
  };

  return (
    <div className="relative w-full max-w-md">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar OT, ticket, cliente o cotización…"
        className="h-9 bg-background pl-9 text-sm"
      />
      {abierto && (
        <div className="absolute left-0 top-11 z-50 w-full overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          {buscando ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">Buscando…</p>
          ) : total === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">Sin resultados para “{q.trim()}”.</p>
          ) : (
            <div className="max-h-96 divide-y divide-border overflow-y-auto">
              {otsEncontradas.length > 0 && (
                <Grupo titulo="Órdenes de trabajo">
                  {otsEncontradas.map((o) => (
                    <Fila
                      key={o.id}
                      principal={o.numero}
                      secundario={`${o.titulo} · ${etiquetaEstadoOt(o.estado)}`}
                      onSelect={() => abrirOT(o.id)}
                    />
                  ))}
                </Grupo>
              )}
              {ticketsEncontrados.length > 0 && (
                <Grupo titulo="Tickets">
                  {ticketsEncontrados.map((t) => (
                    <Fila
                      key={t.id}
                      principal={t.numero}
                      secundario={`${t.asunto} · ${etiquetaEstadoTicket(t.estado)}`}
                      onSelect={() => {
                        abrirTicket(t.id);
                        navigate({ to: "/tickets" });
                      }}
                    />
                  ))}
                </Grupo>
              )}
              {cotizacionesEncontradas.length > 0 && (
                <Grupo titulo="Cotizaciones">
                  {cotizacionesEncontradas.map((c) => (
                    <Fila
                      key={c.id}
                      principal={c.numero}
                      secundario={`${etiquetaEstadoCotizacion(c.estado)} · ${formatoMoneda(c.montoClp)}`}
                      onSelect={() => navigate({ to: "/cotizaciones" })}
                    />
                  ))}
                </Grupo>
              )}
              {clientesEncontrados.length > 0 && (
                <Grupo titulo="Clientes">
                  {clientesEncontrados.map((c) => (
                    <Fila key={c.id} principal="" secundario={c.nombre} />
                  ))}
                </Grupo>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [colapsado, setColapsado] = useState(false);
  const [menuMovil, setMenuMovil] = useState(false);
  // Reemplaza la fecha fija del mock ("jue 10 sep 2026") por la fecha real del navegador.
  const fechaHoyBadge = new Date()
    .toLocaleDateString("es-CL", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })
    .replace(",", "");

  // El portal público de la mesa de ayuda y el login no usan el shell interno.
  if (path.startsWith("/login") || path.startsWith("/mesa-de-ayuda")) return <>{children}</>;

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden shrink-0 md:block",
          colapsado ? "w-16" : "w-56",
        )}
      >
        <SidebarContenido colapsado={colapsado} onToggle={() => setColapsado((c) => !c)} />
      </aside>

      <Sheet open={menuMovil} onOpenChange={setMenuMovil}>
        <SheetContent side="left" className="w-64 border-0 bg-nav p-0">
          <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
          <SidebarContenido colapsado={false} onNavigate={() => setMenuMovil(false)} />
        </SheetContent>
      </Sheet>

      <div
        className={cn(
          "flex min-h-screen min-w-0 flex-1 flex-col",
          colapsado ? "md:pl-16" : "md:pl-56",
        )}
      >
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur sm:px-6">
          <button
            onClick={() => setMenuMovil(true)}
            className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
            aria-label="Abrir menú"
          >
            <Menu className="size-[18px]" />
          </button>
          <BuscadorGlobal />
          <Badge variant="outline" className="ml-auto hidden font-mono text-[11px] font-normal lg:inline-flex">
            {fechaHoyBadge}
          </Badge>
          <Notificaciones />
          <div className="border-l border-border pl-2 sm:pl-3">
            <MenuPerfil />
          </div>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
      <OTDetail />
      <ResumenInicio />
    </div>
  );
}
