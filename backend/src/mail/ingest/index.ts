import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { ImapMailboxSource } from "./ImapMailboxSource.js";
import type { MailboxSource } from "./MailboxSource.js";
import { NoopMailboxSource } from "./NoopMailboxSource.js";

// Factory por env.mailbox.provider (Fase 6). "graph" queda en el tipo (ver config/env.ts) como
// hueco para el futuro; no se implementa de verdad todavía (mismo patrón que security/index.ts).
// Sin IMAP_HOST configurado se usa NoopMailboxSource aunque provider sea "imap": no hay buzón real
// todavía (lo administra IT, "se consulta cuando haga falta" — decisión 0.1 del diseño).
function crearMailboxSource(): { source: MailboxSource; real: boolean } {
  if (env.mailbox.provider === "graph") {
    throw new Error("Proveedor de buzón no implementado todavía: graph");
  }
  if (env.mailbox.imapHost) return { source: new ImapMailboxSource(), real: true };
  return { source: new NoopMailboxSource(), real: false };
}

const creado = crearMailboxSource();
export const mailboxSource: MailboxSource = creado.source;
export const mailboxSourceReal = creado.real;

// Llamado desde api/worker.ts al arrancar (es el proceso que corre la ingesta), igual que
// advertirSiNoHayAntivirus/advertirSiNoHayCaptchaReal/advertirSiNoHayMailerReal.
export function advertirSiNoHayMailboxReal(real: boolean): void {
  if (!real) {
    logger.warn(
      "No hay buzón IMAP real configurado (NoopMailboxSource): la ingesta de correo no encuentra mensajes nuevos (IMAP_HOST vacío)",
    );
  }
}
