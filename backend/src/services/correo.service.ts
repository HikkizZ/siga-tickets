import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { CorreoSaliente } from "../entities/CorreoSaliente.js";
import { renderPlantilla, type DatosAvisoSoporte, type DatosRespuestaCliente, type DatosTicketCreado } from "../mail/outbound/plantillas.js";
import type { ManagerTransaccional } from "./folio.service.js";

// Message-ID propio, único, con formato válido de RFC 5322 (<id-local@dominio>).
export function generarMessageId(): string {
  return `<${randomUUID()}@${env.mail.dominio}>`;
}

// References: se encadena con el Message-ID anterior QUE YA SALIÓ para este ticket. Se busca en
// correo_saliente (header X-SIGA-Ticket), no en mensaje_ticket.message_id: así encadena también
// los dos correos de la creación por portal (ticket_creado, aviso_soporte), que no están ligados a
// ningún mensaje_ticket y por lo tanto no aparecerían ahí. JSON_VALUE lee el header directamente
// del JSON guardado, sin necesitar una columna ticket_id en correo_saliente (no hay migración
// nueva en esta fase).
async function messageIdAnterior(manager: ManagerTransaccional, numero: string): Promise<string | null> {
  const filas: Array<{ message_id: string | null }> = await manager.query(
    `SELECT TOP 1 JSON_VALUE(headers, '$."Message-ID"') AS message_id
     FROM correo_saliente
     WHERE JSON_VALUE(headers, '$."X-SIGA-Ticket"') = @0
     ORDER BY creado_en DESC`,
    [numero],
  );
  return filas[0]?.message_id ?? null;
}

interface EncolarCorreoInputBase {
  numero: string;
  para: string;
  mensajeTicketId?: string | undefined;
  headersExtra?: Record<string, string> | undefined;
  // Si ya se generó el Message-ID de antemano (p. ej. para guardarlo en mensaje_ticket.message_id
  // en el mismo INSERT que crea el mensaje), se reutiliza en vez de generar uno nuevo.
  messageId?: string | undefined;
}

export type EncolarCorreoInput =
  | (EncolarCorreoInputBase & { plantilla: "ticket_creado"; datos: DatosTicketCreado })
  | (EncolarCorreoInputBase & { plantilla: "aviso_soporte"; datos: DatosAvisoSoporte })
  | (EncolarCorreoInputBase & { plantilla: "respuesta_cliente"; datos: DatosRespuestaCliente });

// Outbox transaccional (docs/backend-diseno.md sección 5): SIEMPRE se llama dentro de la MISMA
// transacción del hecho que origina el correo (crear ticket por portal, publicar respuesta_cliente
// desde el panel). El envío real lo hace jobs/correoSalienteJob.ts; este helper solo encola.
export async function encolarCorreo(manager: ManagerTransaccional, input: EncolarCorreoInput): Promise<string> {
  const messageId = input.messageId ?? generarMessageId();
  const referencias = await messageIdAnterior(manager, input.numero);
  const { asunto, cuerpoHtml } = renderPlantilla(input.plantilla, input.datos);

  const headers: Record<string, string> = {
    "Message-ID": messageId,
    "X-SIGA-Ticket": input.numero,
    ...(referencias ? { References: referencias } : {}),
    ...(input.headersExtra ?? {}),
  };

  await manager.insert(CorreoSaliente, {
    plantilla: input.plantilla,
    para: input.para,
    asunto,
    cuerpoHtml,
    headers,
    mensajeTicketId: input.mensajeTicketId ?? null,
  });

  return messageId;
}
