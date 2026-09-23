import type { CorreoEntrante, MailboxSource } from "./MailboxSource.js";

// Placeholder: no hay buzón IMAP real configurado (IMAP_HOST vacío). Nunca devuelve mensajes; el
// cursor se mantiene tal cual llegó (o '0' en la primera llamada) para que jobs/ingestaCorreoJob.ts
// tenga algo determinista que persistir. Mismo espíritu que NoopAntivirus/NoopCaptcha/ConsoleMailer.
export class NoopMailboxSource implements MailboxSource {
  nombre(): string {
    return "noop";
  }

  async fetchNuevos(cursor: string | null): Promise<{ mensajes: CorreoEntrante[]; cursor: string }> {
    return { mensajes: [], cursor: cursor ?? "0" };
  }
}
