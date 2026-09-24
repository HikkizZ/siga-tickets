// Funciones de red puras para Tickets (docs/api.md, sección "Tickets (Fase 3, SLA extendido en
// Fase 4)" + "Adjuntos"), mismo patrón que src/lib/api/ots.ts / cotizaciones.ts. `TramoResponsable`
// y `UsuarioRef` se reutilizan de ots.ts: el ticket real trae `cadenaResponsables` con la misma
// forma exacta que la OT (docs/api.md lo confirma).
import { apiClient } from "./client";
import type { CategoriaOt } from "@/lib/labels";
import type { CanalTicketRef, EstadoTicketRef, OtDetalle, PrioridadRef, TramoResponsable, UsuarioRef } from "./ots";

export type ClienteRefTicket = { id: string; nombre: string } | null;

// ---- Listado (GET /tickets) ----

export type TicketResumen = {
  id: string;
  numero: string;
  asunto: string;
  canal: CanalTicketRef;
  prioridad: PrioridadRef;
  estado: EstadoTicketRef;
  cliente: ClienteRefTicket;
  solicitanteNombre: string | null;
  responsable: UsuarioRef | null;
  fechaIngreso: string;
  slaEstado: "en_plazo" | "por_vencer" | "vencida";
};

export type TicketsFiltros = {
  page?: number | undefined;
  perPage?: number | undefined;
  orden?: "numero" | "asunto" | "estado" | "prioridad" | "fechaIngreso" | "creadoEn" | "actualizadoEn" | undefined;
  dir?: "asc" | "desc" | undefined;
  estadoId?: string | undefined;
  prioridadId?: string | undefined;
  canalId?: string | undefined;
  responsable?: string | undefined;
  mios?: boolean | undefined;
  sinAsignar?: boolean | undefined;
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

export async function obtenerTickets(
  filtros?: TicketsFiltros,
): Promise<{ items: TicketResumen[]; total: number; page: number; perPage: number }> {
  const { data, meta } = await apiClient.get<TicketResumen[]>(`/tickets${aQueryString(filtros)}`);
  return {
    items: data,
    total: (meta?.["total"] as number | undefined) ?? data.length,
    page: (meta?.["page"] as number | undefined) ?? 1,
    perPage: (meta?.["perPage"] as number | undefined) ?? data.length,
  };
}

// ---- Detalle (GET /tickets/:id) ----

export type AdjuntoTicket = {
  id: string;
  nombre: string;
  mime: string;
  tamanoBytes: number;
  estado: string;
  subidoPor: UsuarioRef;
  creadoEn: string;
};

export type TipoMensajeTicket = "cliente" | "respuesta_cliente" | "nota_interna";

export type MensajeTicket = {
  id: string;
  tipo: TipoMensajeTicket;
  autor: UsuarioRef | null;
  autorExterno: string | null;
  cuerpo: string;
  adjuntos: AdjuntoTicket[];
  creadoEn: string;
};

export type OtEmbebidaTicket = { id: string; numero: string; titulo: string; estado: string; esOrigen: boolean };

// Tema de ayuda asignado en la creación (Fase B1, opcional). Solo referencia — el departamento/
// prioridad sugerida de ese tema se consultan en /temas-ayuda, no vienen embebidos acá.
export type TemaAyudaRefTicket = { id: string; nombre: string } | null;

export type EventoTicket = { id: string; tipo: string; actor: UsuarioRef; payload: Record<string, unknown>; ocurridoEn: string };

export type TicketDetalle = {
  id: string;
  numero: string;
  asunto: string;
  descripcion: string;
  solicitanteNombre: string | null;
  solicitanteEmail: string | null;
  solicitanteTelefono: string | null;
  solicitanteEmpresa: string | null;
  cliente: ClienteRefTicket;
  temaAyuda: TemaAyudaRefTicket;
  canal: CanalTicketRef;
  prioridad: PrioridadRef;
  estado: EstadoTicketRef;
  fechaIngreso: string;
  recepcionadoPor: UsuarioRef;
  responsable: UsuarioRef | null;
  primeraRespuestaEn: string | null;
  resueltoEn: string | null;
  cerradoEn: string | null;
  slaEstado: "en_plazo" | "por_vencer" | "vencida";
  slaResolucionVenceEn: string | null;
  slaRespuestaVenceEn: string | null;
  creadoEn: string;
  actualizadoEn: string;
  cadenaResponsables: TramoResponsable[];
  mensajes: MensajeTicket[];
  adjuntos: AdjuntoTicket[];
  ots: OtEmbebidaTicket[];
  eventos: EventoTicket[];
};

export async function obtenerTicket(id: string): Promise<TicketDetalle> {
  const { data } = await apiClient.get<TicketDetalle>(`/tickets/${id}`);
  return data;
}

// ---- Crear (POST /tickets) ----

export type CrearTicketInput = {
  asunto: string;
  descripcion: string;
  solicitanteNombre: string;
  solicitanteEmail: string;
  solicitanteTelefono?: string;
  clienteId?: string;
  // Fase C: uuid de una fila existente, activa y con `esManual: true` del catálogo CanalTicket
  // (docs/api.md, POST /tickets) — antes un valor fijo de enum.
  canalId: string;
  prioridadId: string;
  // Tema de ayuda opcional (Fase B1): solo se guarda, sin ningún efecto automático sobre
  // prioridad, SLA ni categoría (docs/api.md).
  temaAyudaId?: string;
};

export async function crearTicket(input: CrearTicketInput): Promise<TicketDetalle> {
  const { data } = await apiClient.post<TicketDetalle>("/tickets", input);
  return data;
}

// ---- Actualizar (PATCH /tickets/:id) ----

export type ActualizarTicketInput = Partial<{
  asunto: string;
  descripcion: string;
  prioridadId: string;
}>;

export async function actualizarTicket(id: string, datos: ActualizarTicketInput): Promise<TicketDetalle> {
  const { data } = await apiClient.patch<TicketDetalle>(`/tickets/${id}`, datos);
  return data;
}

// ---- Estado (POST /tickets/:id/estado) ----

export async function cambiarEstadoTicket(id: string, estadoId: string): Promise<TicketDetalle> {
  const { data } = await apiClient.post<TicketDetalle>(`/tickets/${id}/estado`, { estadoId });
  return data;
}

// ---- Tomar (POST /tickets/:id/tomar, sin body) ----

export async function tomarTicket(id: string): Promise<TicketDetalle> {
  const { data } = await apiClient.post<TicketDetalle>(`/tickets/${id}/tomar`);
  return data;
}

// ---- Mensajes (POST /tickets/:id/mensajes) ----

export type CrearMensajeInput = {
  tipo: Extract<TipoMensajeTicket, "respuesta_cliente" | "nota_interna">;
  cuerpo: string;
  adjuntoIds?: string[];
};

export async function agregarMensajeTicket(id: string, datos: CrearMensajeInput): Promise<MensajeTicket> {
  const { data } = await apiClient.post<MensajeTicket>(`/tickets/${id}/mensajes`, datos);
  return data;
}

// ---- Derivar (POST /tickets/:id/derivar) ----

export type DerivarTicketInput = { destinoId: string; motivo: string };

export async function derivarTicket(id: string, datos: DerivarTicketInput): Promise<TicketDetalle> {
  const { data } = await apiClient.post<TicketDetalle>(`/tickets/${id}/derivar`, datos);
  return data;
}

// ---- Convertir a OT (POST /tickets/:id/convertir-a-ot) ----
// "Herencia completa": devuelve el Detalle de la OT nueva (mismo formato que GET /ots/:id), no el
// ticket — por eso el tipo de retorno viene de ots.ts.

export type ConvertirTicketAOtInput = {
  titulo?: string;
  descripcion?: string;
  categoria: CategoriaOt;
  prioridadId?: string;
  ubicacion?: string;
  fechaEstimadaTermino?: string;
} & ({ esInterna: true; areaInterna: string } | { esInterna?: false; clienteId?: string });

export async function convertirTicketAOt(id: string, datos: ConvertirTicketAOtInput): Promise<OtDetalle> {
  const { data } = await apiClient.post<OtDetalle>(`/tickets/${id}/convertir-a-ot`, datos);
  return data;
}

// ---- Vincular / desvincular OT existente (POST/DELETE /tickets/:id/ots[/:otId]) ----
// Distinto de convertir-a-ot: liga una OT YA existente, sin herencia.

export async function vincularOtATicket(id: string, otId: string): Promise<TicketDetalle> {
  const { data } = await apiClient.post<TicketDetalle>(`/tickets/${id}/ots`, { otId });
  return data;
}

export async function desvincularOtDeTicket(id: string, otId: string): Promise<void> {
  await apiClient.delete(`/tickets/${id}/ots/${otId}`);
}

// ---- Adjuntos ----

export async function subirAdjuntoTicket(ticketId: string, archivo: File): Promise<AdjuntoTicket> {
  const formData = new FormData();
  formData.set("entidadTipo", "ticket");
  formData.set("entidadId", ticketId);
  formData.set("archivo", archivo);
  const { data } = await apiClient.postForm<AdjuntoTicket>("/adjuntos", formData);
  return data;
}
