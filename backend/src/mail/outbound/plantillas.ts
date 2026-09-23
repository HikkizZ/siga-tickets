// Plantillas de correo saliente (Fase 5). HTML mínimo a propósito: en esta fase importa el
// pipeline (outbox, headers, reintentos), no el diseño visual del correo.
import { obtenerPlantillaActiva } from "../../services/plantillaCorreo.service.js";

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

// Interpola cada {{campo}} presente en el texto de una plantilla personalizada (Fase B2) por el
// valor correspondiente de `datos`, SIEMPRE escapado con escapeHtml: sigue siendo texto de usuario
// final insertado ahí (p. ej. nombreSolicitante), aunque la plantilla la haya editado un admin. Un
// placeholder que no exista en `datos` se trata como un error de configuración de la plantilla:
// lanza, y renderPlantillaConfigurable cae al fallback fijo en vez de mandar un correo con un
// placeholder sin reemplazar.
function interpolar(texto: string, datos: Record<string, string>): string {
  return texto.replace(/\{\{(\w+)\}\}/g, (_match, campo: string) => {
    if (!Object.prototype.hasOwnProperty.call(datos, campo)) {
      throw new Error(`Plantilla personalizada usa un placeholder desconocido: {{${campo}}}`);
    }
    return escapeHtml(datos[campo]!);
  });
}

function datosComoTexto(datos: DatosPlantilla): Record<string, string> {
  return Object.fromEntries(Object.entries(datos).map(([campo, valor]) => [campo, String(valor)]));
}

// Variante configurable (Fase B2) de renderPlantilla(), con fallback SEGURO al texto fijo: si no
// hay una plantilla personalizada activa en BD para `nombre`, o si la interpolación falla por
// cualquier motivo (placeholder desconocido, error de BD, etc.), nunca debe romperse el envío de
// un correo por una plantilla mal configurada — siempre cae a renderPlantilla(). Es la única
// función que correo.service.ts::encolarCorreo debe llamar para renderizar un correo real.
export async function renderPlantillaConfigurable(nombre: NombrePlantilla, datos: DatosPlantilla): Promise<Renderizado> {
  try {
    const personalizada = await obtenerPlantillaActiva(nombre);
    if (!personalizada) return renderPlantilla(nombre, datos);

    const datosTexto = datosComoTexto(datos);
    return {
      asunto: interpolar(personalizada.asunto, datosTexto),
      cuerpoHtml: interpolar(personalizada.cuerpoHtml, datosTexto),
    };
  } catch {
    return renderPlantilla(nombre, datos);
  }
}
