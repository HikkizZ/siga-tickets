// Plantillas de correo saliente (Fase 5). HTML mínimo a propósito: en esta fase importa el
// pipeline (outbox, headers, reintentos), no el diseño visual del correo.
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export type NombrePlantilla = "ticket_creado" | "aviso_soporte" | "respuesta_cliente";

export interface DatosTicketCreado {
  numero: string;
  asunto: string;
  nombreSolicitante: string;
}
export interface DatosAvisoSoporte {
  numero: string;
  asunto: string;
  nombreSolicitante: string;
  correoSolicitante: string;
}
export interface DatosRespuestaCliente {
  numero: string;
  asunto: string;
  cuerpo: string;
}
export type DatosPlantilla = DatosTicketCreado | DatosAvisoSoporte | DatosRespuestaCliente;

interface Renderizado {
  asunto: string;
  cuerpoHtml: string;
}

// Sin sobrecargas: el llamador (correo.service.ts) recibe `plantilla`/`datos` ya discriminados
// como una unión etiquetada (EncolarCorreoInput), pero al desestructurarlos por separado TS los
// vuelve a ensanchar; el switch de abajo es el único lugar que necesita el cast.
export function renderPlantilla(nombre: NombrePlantilla, datos: DatosPlantilla): Renderizado {
  switch (nombre) {
    case "ticket_creado": {
      const d = datos as DatosTicketCreado;
      return {
        asunto: `[${d.numero}] Recibimos tu solicitud`,
        cuerpoHtml:
          `<p>Hola ${escapeHtml(d.nombreSolicitante)},</p>` +
          `<p>Recibimos tu solicitud <strong>${escapeHtml(d.numero)}</strong>: "${escapeHtml(d.asunto)}".</p>` +
          `<p>Puedes hacer seguimiento en el portal con tu número de ticket y tu correo.</p>`,
      };
    }
    case "aviso_soporte": {
      const d = datos as DatosAvisoSoporte;
      return {
        asunto: `Nuevo ticket ${d.numero}: ${d.asunto}`,
        cuerpoHtml:
          `<p>Nuevo ticket recibido por el portal.</p>` +
          `<p><strong>${escapeHtml(d.numero)}</strong> — ${escapeHtml(d.asunto)}</p>` +
          `<p>Solicitante: ${escapeHtml(d.nombreSolicitante)} (${escapeHtml(d.correoSolicitante)})</p>`,
      };
    }
    case "respuesta_cliente": {
      const d = datos as DatosRespuestaCliente;
      return {
        asunto: `Re: [${d.numero}] ${d.asunto}`,
        cuerpoHtml: `<p>${escapeHtml(d.cuerpo).replace(/\n/g, "<br>")}</p>`,
      };
    }
  }
}
