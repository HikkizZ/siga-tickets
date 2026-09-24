// Funciones de red puras para EstadoTicket (docs/api.md, sección "Catálogos administrables (Fase
// C)"): catálogo con 6 flags de comportamiento (antes codificados por el valor del enum viejo, ver
// docs/backend-diseno.md sección 20). Mismo patrón CRUD que departamentos.ts (sin DELETE, se
// desactiva con `activo`). Sin React ni TanStack Query acá, eso vive en
// src/hooks/useEstadosTicket.ts.
import { apiClient } from "./client";

export type EstadoTicket = {
  id: string;
  nombre: string;
  orden: number;
  activo: boolean;
  esEstadoInicial: boolean;
  esDestinoReapertura: boolean;
  esPausaSla: boolean;
  marcaResueltoEn: boolean;
  marcaCerradoEn: boolean;
  esTerminal: boolean;
};

export async function obtenerEstadosTicket(): Promise<EstadoTicket[]> {
  const { data } = await apiClient.get<EstadoTicket[]>("/estados-ticket");
  return data;
}

export type CrearEstadoTicketInput = Partial<
  Omit<EstadoTicket, "id" | "nombre">
> & { nombre: string };

export async function crearEstadoTicket(datos: CrearEstadoTicketInput): Promise<EstadoTicket> {
  const { data } = await apiClient.post<EstadoTicket>("/estados-ticket", datos);
  return data;
}

export type ActualizarEstadoTicketInput = Partial<Omit<EstadoTicket, "id">>;

export async function actualizarEstadoTicket(id: string, datos: ActualizarEstadoTicketInput): Promise<EstadoTicket> {
  const { data } = await apiClient.patch<EstadoTicket>(`/estados-ticket/${id}`, datos);
  return data;
}
