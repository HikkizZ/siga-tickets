// Ingesta de correo (Fase 6) detrás de una interfaz, mismo espíritu que mail/outbound/Mailer.ts y
// storage/FileStorage.ts: hoy IMAP genérico (decisión 0.1 del diseño), mañana Graph, sin tocar
// jobs/ingestaCorreoJob.ts ni services/correoIngerido.service.ts.
export interface CorreoEntrante {
  messageId: string;
  inReplyTo: string | null;
  referencias: string[];
  de: { nombre: string | null; email: string };
  para: string[];
  asunto: string;
  texto: string;
  html: string | null;
  adjuntos: Array<{ nombre: string; mime: string; buffer: Buffer }>;
  recibidoEn: Date;
  cabeceras: Record<string, string>;
}

export interface MailboxSource {
  // Identifica el origen (clave de mailbox_cursor y valor de correo_ingerido.origen): estable por
  // implementación, no cambia entre reinicios.
  nombre(): string;
  // cursor=null en la primera llamada (sin fila en mailbox_cursor todavía). Devuelve los mensajes
  // nuevos y el cursor a partir del cual continuar la próxima vez.
  fetchNuevos(cursor: string | null): Promise<{ mensajes: CorreoEntrante[]; cursor: string }>;
}
