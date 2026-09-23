import { logger } from "../../config/logger.js";
import { obtenerCredencialesCorreoDescifradas } from "../../services/correoConfig.service.js";
import { ImapMailboxSource } from "./ImapMailboxSource.js";
import type { MailboxSource } from "./MailboxSource.js";
import { NoopMailboxSource } from "./NoopMailboxSource.js";

// Fase A: mismo cambio que mail/outbound/index.ts — la config ya no se fija al importar el módulo
// (Fase 6), vive en ConfiguracionCorreo (BD) y puede cambiar en caliente. Graph sigue sin
// implementarse (fuera de alcance de esta fase, no se toca): sin imapHabilitado + credenciales
// completas, se usa NoopMailboxSource, igual que antes sin IMAP_HOST.
export async function crearMailboxSource(): Promise<{ source: MailboxSource; real: boolean }> {
  const cred = await obtenerCredencialesCorreoDescifradas();
  if (cred?.imapHabilitado && cred.imapHost && cred.imapUser && cred.imapPassword) {
    return {
      source: new ImapMailboxSource({
        host: cred.imapHost,
        port: cred.imapPort ?? 993,
        user: cred.imapUser,
        pass: cred.imapPassword,
        tls: cred.imapTls,
        folder: cred.imapFolder ?? "INBOX",
      }),
      real: true,
    };
  }
  return { source: new NoopMailboxSource(), real: false };
}

// Llamado desde api/worker.ts al arrancar, una sola vez, best-effort — mismo criterio y misma
// justificación que advertirSiNoHayMailerReal en mail/outbound/index.ts.
export async function advertirSiNoHayMailboxReal(): Promise<void> {
  const { real } = await crearMailboxSource();
  if (!real) {
    logger.warn(
      "No hay buzón IMAP real configurado (NoopMailboxSource): la ingesta de correo no encuentra mensajes nuevos",
    );
  }
}
