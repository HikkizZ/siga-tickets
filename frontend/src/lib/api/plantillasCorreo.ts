// Funciones de red puras para Plantillas de correo (docs/api.md, sección "Plantillas de correo
// (Fase B2)"): las 3 plantillas fijas de correo saliente (`ticket_creado`, `aviso_soporte`,
// `respuesta_cliente`), solo edición (sin creación ni borrado). Mismo patrón que
// correoConfig.ts — sin React ni TanStack Query acá, eso vive en src/hooks/usePlantillasCorreo.ts.
import { apiClient } from "./client";

export type NombrePlantilla = "ticket_creado" | "aviso_soporte" | "respuesta_cliente";

// Orden fijo en el que el backend siempre las devuelve (docs/api.md).
export const NOMBRES_PLANTILLA: readonly NombrePlantilla[] = [
  "ticket_creado",
  "aviso_soporte",
  "respuesta_cliente",
];

// Placeholders `{{campo}}` que acepta cada plantilla (docs/api.md, `mail/outbound/plantillas.ts`).
export const PLACEHOLDERS_PLANTILLA: Record<NombrePlantilla, readonly string[]> = {
  ticket_creado: ["numero", "asunto", "nombreSolicitante"],
  aviso_soporte: ["numero", "asunto", "nombreSolicitante", "correoSolicitante"],
  respuesta_cliente: ["numero", "asunto", "cuerpo"],
};

export type PlantillaCorreo = {
  nombre: NombrePlantilla;
  asunto: string;
  cuerpoHtml: string;
  activa: boolean;
  // Si hay una fila real en BD para este nombre. `false` = se muestra el texto fijo actual, solo
  // para tener algo que mostrar antes de personalizar (el envío real nunca usa ese texto).
  personalizada: boolean;
  actualizadoEn: string | null;
};

export async function obtenerPlantillasCorreo(): Promise<PlantillaCorreo[]> {
  const { data } = await apiClient.get<PlantillaCorreo[]>("/correo/plantillas");
  return data;
}

export type ActualizarPlantillaCorreoInput = { asunto: string; cuerpoHtml: string; activa?: boolean };

export async function actualizarPlantillaCorreo(
  nombre: NombrePlantilla,
  datos: ActualizarPlantillaCorreoInput,
): Promise<PlantillaCorreo> {
  const { data } = await apiClient.put<PlantillaCorreo>(`/correo/plantillas/${nombre}`, datos);
  return data;
}
