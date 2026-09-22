import { logger } from "../../config/logger.js";

export interface MensajeSaliente {
  para: string;
  asunto: string;
  cuerpoHtml: string;
  headers: Record<string, string>;
}

// Envío real de correo detrás de una interfaz (Fase 5), mismo espíritu que storage/FileStorage.ts:
// hoy log estructurado, mañana SMTP, sin tocar jobs/correoSalienteJob.ts.
export interface Mailer {
  enviar(msg: MensajeSaliente): Promise<void>;
}

// Placeholder por defecto: registra el correo en el log en vez de enviarlo (no hay credenciales
// SMTP reales todavía). El job igual lo marca 'enviado' (desde su punto de vista, se envió).
export class ConsoleMailer implements Mailer {
  async enviar(msg: MensajeSaliente): Promise<void> {
    logger.info({ para: msg.para, asunto: msg.asunto, headers: msg.headers }, "Correo saliente (ConsoleMailer, no se envía de verdad)");
  }
}
