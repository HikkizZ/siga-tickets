import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject, type HeaderValue, type ParsedMail } from "mailparser";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import type { CorreoEntrante, MailboxSource } from "./MailboxSource.js";

// Convierte un valor de cabecera de mailparser (puede ser string, array, AddressObject, Date o
// StructuredHeader) a texto plano; solo interesa comparar contra valores simples (Auto-Submitted,
// Precedence, Content-Type), así que cualquier forma más compleja se aplana con JSON.stringify.
function aTexto(v: HeaderValue): string {
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(", ");
  return JSON.stringify(v);
}

function direccion(a: AddressObject | AddressObject[] | undefined): { nombre: string | null; email: string } {
  const primero = Array.isArray(a) ? a[0]?.value[0] : a?.value[0];
  return { nombre: primero?.name || null, email: primero?.address ?? "" };
}

function destinatarios(a: AddressObject | AddressObject[] | undefined): string[] {
  const lista = Array.isArray(a) ? a : a ? [a] : [];
  return lista.flatMap((ao) => ao.value.map((v) => v.address).filter((x): x is string => !!x));
}

function aCorreoEntrante(parsed: ParsedMail): CorreoEntrante {
  const cabeceras: Record<string, string> = {};
  for (const [clave, valor] of parsed.headers) cabeceras[clave] = aTexto(valor);

  const referencias = Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : [];

  return {
    // Un correo sin Message-ID (raro, pero posible) igual necesita idempotencia: se sintetiza uno
    // estable a partir de remitente+fecha+asunto para no reventar el UNIQUE de correo_ingerido.
    messageId: parsed.messageId ?? `<sin-message-id-${direccion(parsed.from).email}-${(parsed.date ?? new Date()).getTime()}@desconocido>`,
    inReplyTo: parsed.inReplyTo ?? null,
    referencias,
    de: direccion(parsed.from),
    para: destinatarios(parsed.to),
    asunto: parsed.subject ?? "",
    texto: parsed.text ?? "",
    html: typeof parsed.html === "string" ? parsed.html : null,
    adjuntos: parsed.attachments.map((a) => ({ nombre: a.filename ?? "adjunto", mime: a.contentType, buffer: a.content })),
    recibidoEn: parsed.date ?? new Date(),
    cabeceras,
  };
}

// IMAP genérico (imapflow + mailparser), decisión 0.1 del diseño. Usa UID, no fechas: más
// confiable entre reinicios (una fecha puede repetirse o el reloj del servidor IMAP desviarse; el
// UID es monótono dentro de un mismo UIDVALIDITY). cursor = UID más alto ya procesado ("0" si
// nunca se leyó el buzón); se busca el rango (cursor+1):* en cada pasada.
export class ImapMailboxSource implements MailboxSource {
  nombre(): string {
    return `imap:${env.mailbox.imapFolder}`;
  }

  async fetchNuevos(cursor: string | null): Promise<{ mensajes: CorreoEntrante[]; cursor: string }> {
    const ultimoUid = cursor ? Number(cursor) : 0;
    const client = new ImapFlow({
      host: env.mailbox.imapHost!,
      port: env.mailbox.imapPort,
      secure: env.mailbox.imapTls,
      auth: { user: env.mailbox.imapUser!, pass: env.mailbox.imapPass },
      logger: false,
    });

    await client.connect();
    const mensajes: CorreoEntrante[] = [];
    let nuevoUid = ultimoUid;
    try {
      const lock = await client.getMailboxLock(env.mailbox.imapFolder);
      try {
        const rango = `${ultimoUid + 1}:*`;
        for await (const msg of client.fetch(rango, { uid: true, source: true }, { uid: true })) {
          // El rango a:* de IMAP siempre devuelve al menos el último mensaje del buzón, incluso si
          // su UID es menor al pedido (buzón vacío o sin mensajes nuevos): se descarta a mano.
          if (msg.uid <= ultimoUid || !msg.source) continue;
          const parsed = await simpleParser(msg.source);
          mensajes.push(aCorreoEntrante(parsed));
          if (msg.uid > nuevoUid) nuevoUid = msg.uid;
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch((err: unknown) => logger.warn({ err }, "Error cerrando la sesión IMAP (se ignora)"));
    }

    return { mensajes, cursor: String(nuevoUid) };
  }
}
