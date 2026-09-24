// Funciones de red puras para OT (docs/api.md, sección "OT" + "Adjuntos" de la Fase 1 del
// backend). Sin React ni TanStack Query acá — eso vive en src/hooks/useOts.ts, mismo patrón que
// src/lib/api/usuarios.ts / clientes.ts de la Fase 0.
import { apiClient } from "./client";
import { getToken } from "@/lib/auth/token";
import type { CategoriaOt, EstadoOt, OrigenOt } from "@/lib/labels";

export type UsuarioRef = { id: string; nombre: string };
export type ClienteRef = { id: string; nombre: string } | null;

// Fase C: Prioridad (compartida por OT y Ticket) y EstadoTicket/CanalTicket (Ticket) dejaron de
// ser enums fijos y pasan a catálogos administrables — se exponen como `{id, nombre}`, igual que
// cliente/responsable. Se definen acá (no en tickets.ts) porque OtDetalle.tickets (TicketEmbebido,
// más abajo) también los necesita, y tickets.ts ya importa de este archivo.
export type PrioridadRef = { id: string; nombre: string };
export type EstadoTicketRef = { id: string; nombre: string };
export type CanalTicketRef = { id: string; nombre: string };

// ---- Listado (GET /ots) ----

export type OtListItem = {
  id: string;
  numero: string;
  titulo: string;
  cliente: ClienteRef;
  areaInterna: string | null;
  esInterna: boolean;
  categoria: CategoriaOt;
  prioridad: PrioridadRef;
  origen: OrigenOt;
  estado: EstadoOt;
  solicitanteNombre: string | null;
  responsable: UsuarioRef;
  fechaIngreso: string;
  fechaEstimadaTermino: string | null;
  slaEstado: "en_plazo" | "por_vencer" | "vencida";
};

export type OtsFiltros = {
  page?: number | undefined;
  perPage?: number | undefined;
  orden?:
    | "numero"
    | "titulo"
    | "estado"
    | "prioridad"
    | "fechaIngreso"
    | "fechaEstimadaTermino"
    | "creadoEn"
    | "actualizadoEn"
    | undefined;
  dir?: "asc" | "desc" | undefined;
  estado?: EstadoOt | undefined;
  prioridadId?: string | undefined;
  categoria?: CategoriaOt | undefined;
  clienteId?: string | undefined;
  responsableId?: string | undefined;
  mios?: boolean | undefined;
  q?: string | undefined;
  desde?: string | undefined;
  hasta?: string | undefined;
};

function aQueryString(filtros: Record<string, unknown> | undefined): string {
  if (!filtros) return "";
  const params = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor === undefined || valor === null || valor === "") continue;
    params.set(clave, String(valor));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function obtenerOts(filtros?: OtsFiltros): Promise<{ items: OtListItem[]; total: number; page: number; perPage: number }> {
  const { data, meta } = await apiClient.get<OtListItem[]>(`/ots${aQueryString(filtros)}`);
  return {
    items: data,
    total: (meta?.["total"] as number | undefined) ?? data.length,
    page: (meta?.["page"] as number | undefined) ?? 1,
    perPage: (meta?.["perPage"] as number | undefined) ?? data.length,
  };
}

// ---- Kanban (GET /ots/kanban) ----

export type OtKanbanItem = {
  id: string;
  numero: string;
  titulo: string;
  cliente: ClienteRef;
  areaInterna: string | null;
  prioridad: PrioridadRef;
  responsable: UsuarioRef;
  colaboradores: { items: UsuarioRef[]; total: number };
  fechaEstimadaTermino: string | null;
  adjuntosCount: number;
  slaEstado: "en_plazo" | "por_vencer" | "vencida";
};

export type OtKanbanColumna = { estado: EstadoOt; total: number; ots: OtKanbanItem[] };

export type OtsKanbanFiltros = Pick<OtsFiltros, "prioridadId" | "categoria" | "clienteId" | "responsableId" | "mios" | "q" | "desde" | "hasta">;

export async function obtenerOtsKanban(filtros?: OtsKanbanFiltros): Promise<OtKanbanColumna[]> {
  const { data } = await apiClient.get<OtKanbanColumna[]>(`/ots/kanban${aQueryString(filtros)}`);
  return data;
}

// ---- Detalle (GET /ots/:id) ----

export type Etapa = { id: string; nombre: string; fechaInicio: string; fechaTermino: string; orden: number };

export type TramoResponsable = {
  id: string;
  usuario: UsuarioRef;
  desde: string;
  hasta: string | null;
  duracionSeg: number;
  actual: boolean;
  motivoEntrada: string | null;
  derivadoPor: UsuarioRef | null;
};

export type HoraItem = { id: string; usuario: UsuarioRef; fecha: string; horas: number; detalle: string | null; creadoEn: string };

export type ComentarioOt = { id: string; autor: UsuarioRef; cuerpo: string; visibleCliente: boolean; creadoEn: string };

export type AdjuntoOt = {
  id: string;
  nombre: string;
  mime: string;
  tamanoBytes: number;
  estado: string;
  subidoPor: UsuarioRef;
  creadoEn: string;
};

export type EventoOt = { id: string; tipo: string; actor: UsuarioRef; payload: Record<string, unknown>; ocurridoEn: string };

export type CotizacionEmbebida = {
  id: string;
  numero: string;
  montoClp: number;
  estado: string;
  version: number;
  esPrincipal: boolean;
  fecha: string;
};

export type TicketEmbebido = {
  id: string;
  numero: string;
  asunto: string;
  estado: EstadoTicketRef;
  canal: CanalTicketRef;
  esOrigen: boolean;
};

export type OtDetalle = {
  id: string;
  numero: string;
  titulo: string;
  descripcion: string;
  estado: EstadoOt;
  prioridad: PrioridadRef;
  categoria: CategoriaOt;
  origen: OrigenOt;
  esInterna: boolean;
  cliente: ClienteRef;
  areaInterna: string | null;
  ubicacion: string | null;
  solicitanteNombre: string | null;
  solicitanteContacto: string | null;
  fechaIngreso: string;
  fechaEstimadaTermino: string | null;
  terminadoEn: string | null;
  slaEstado: "en_plazo" | "por_vencer" | "vencida";
  slaResolucionVenceEn: string | null;
  creadoEn: string;
  actualizadoEn: string;
  recepcionadoPor: UsuarioRef;
  responsable: UsuarioRef;
  colaboradores: UsuarioRef[];
  cadenaResponsables: TramoResponsable[];
  etapas: Etapa[];
  horas: { total: number; items: HoraItem[] };
  comentarios: ComentarioOt[];
  adjuntos: AdjuntoOt[];
  eventos: EventoOt[];
  cotizaciones: CotizacionEmbebida[];
  tickets: TicketEmbebido[];
};

export async function obtenerOt(id: string): Promise<OtDetalle> {
  const { data } = await apiClient.get<OtDetalle>(`/ots/${id}`);
  return data;
}

// ---- Crear (POST /ots) ----

export type CrearOtInput = {
  titulo: string;
  descripcion: string;
  categoria: CategoriaOt;
  prioridadId: string;
  origen: OrigenOt;
  ubicacion?: string;
  solicitanteNombre?: string;
  solicitanteContacto?: string;
  fechaEstimadaTermino?: string;
  responsableId?: string;
  colaboradorIds?: string[];
} & ({ esInterna: true; areaInterna: string } | { esInterna?: false; clienteId: string });

export async function crearOt(input: CrearOtInput): Promise<OtDetalle> {
  const { data } = await apiClient.post<OtDetalle>("/ots", input);
  return data;
}

// ---- Actualizar (PATCH /ots/:id) ----

export type ActualizarOtInput = Partial<{
  titulo: string;
  descripcion: string;
  categoria: CategoriaOt;
  prioridadId: string;
  ubicacion: string | null;
  solicitanteNombre: string | null;
  solicitanteContacto: string | null;
  fechaEstimadaTermino: string | null;
  clienteId: string;
  areaInterna: string;
}>;

export async function actualizarOt(id: string, datos: ActualizarOtInput): Promise<OtDetalle> {
  const { data } = await apiClient.patch<OtDetalle>(`/ots/${id}`, datos);
  return data;
}

// ---- Estado (POST /ots/:id/estado) ----

export async function cambiarEstadoOt(id: string, estado: EstadoOt): Promise<OtDetalle> {
  const { data } = await apiClient.post<OtDetalle>(`/ots/${id}/estado`, { estado });
  return data;
}

// ---- Derivar (POST /ots/:id/derivar) ----

export type DerivarOtInput = { destinoId: string; motivo: string; mantenerComoColaborador?: boolean };

export async function derivarOt(id: string, datos: DerivarOtInput): Promise<OtDetalle> {
  const { data } = await apiClient.post<OtDetalle>(`/ots/${id}/derivar`, datos);
  return data;
}

// ---- Colaboradores ----

export async function agregarColaborador(id: string, usuarioId: string): Promise<UsuarioRef[]> {
  const { data } = await apiClient.post<UsuarioRef[]>(`/ots/${id}/colaboradores`, { usuarioId });
  return data;
}

export async function quitarColaborador(id: string, usuarioId: string): Promise<void> {
  await apiClient.delete(`/ots/${id}/colaboradores/${usuarioId}`);
}

// ---- Comentarios ----

export async function agregarComentario(id: string, datos: { cuerpo: string; visibleCliente?: boolean | undefined }): Promise<ComentarioOt> {
  const { data } = await apiClient.post<ComentarioOt>(`/ots/${id}/comentarios`, datos);
  return data;
}

// ---- Horas ----

export type AgregarHoraInput = { fecha: string; horas: number; detalle?: string; usuarioId: string };

export async function agregarHora(id: string, datos: AgregarHoraInput): Promise<{ hora: HoraItem; total: number }> {
  const { data } = await apiClient.post<{ hora: HoraItem; total: number }>(`/ots/${id}/horas`, datos);
  return data;
}

export async function quitarHora(id: string, horaId: string): Promise<{ total: number }> {
  const { data } = await apiClient.delete<{ total: number }>(`/ots/${id}/horas/${horaId}`);
  return data;
}

// ---- Etapas ----

export type EtapaInput = { nombre: string; fechaInicio: string; fechaTermino: string; orden?: number };

export async function crearEtapa(id: string, datos: EtapaInput): Promise<Etapa> {
  const { data } = await apiClient.post<Etapa>(`/ots/${id}/etapas`, datos);
  return data;
}

export async function actualizarEtapa(id: string, etapaId: string, datos: Partial<EtapaInput>): Promise<Etapa> {
  const { data } = await apiClient.patch<Etapa>(`/ots/${id}/etapas/${etapaId}`, datos);
  return data;
}

export async function eliminarEtapa(id: string, etapaId: string): Promise<void> {
  await apiClient.delete(`/ots/${id}/etapas/${etapaId}`);
}

// ---- Cotizaciones (Fase 2) ----

/** Liga una cotización EXISTENTE (sin OT, o de otra OT) a esta OT — distinto de crear una
 * cotización nueva con `otId` (eso es POST /cotizaciones, ver src/lib/api/cotizaciones.ts).
 * Devuelve el mismo Detalle de OT que GET /ots/:id, ya con la cotización en `cotizaciones`. */
export async function vincularCotizacion(otId: string, cotizacionId: string): Promise<OtDetalle> {
  const { data } = await apiClient.post<OtDetalle>(`/ots/${otId}/cotizaciones/vincular`, { cotizacionId });
  return data;
}

// ---- Adjuntos ----

export async function subirAdjunto(otId: string, archivo: File): Promise<AdjuntoOt> {
  const formData = new FormData();
  formData.set("entidadTipo", "ot");
  formData.set("entidadId", otId);
  formData.set("archivo", archivo);
  const { data } = await apiClient.postForm<AdjuntoOt>("/adjuntos", formData);
  return data;
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3002/api/v1";

/**
 * Descarga un adjunto autenticado: GET /adjuntos/:id/descargar exige el header Authorization
 * (docs/api.md), así que un `<a href>` simple no sirve — se pide con fetch y se entrega como
 * blob para que el navegador lo guarde.
 */
export async function descargarAdjunto(id: string, nombreSugerido: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_URL}/adjuntos/${id}/descargar`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error(`No se pudo descargar el adjunto (HTTP ${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreSugerido;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}
