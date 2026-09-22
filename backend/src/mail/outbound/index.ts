import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import type { Mailer } from "./Mailer.js";
import { ConsoleMailer } from "./Mailer.js";
import { SmtpMailer } from "./SmtpMailer.js";

function crearMailer(): { mailer: Mailer; real: boolean } {
  if (env.mail.provider === "smtp") return { mailer: new SmtpMailer(), real: true };
  return { mailer: new ConsoleMailer(), real: false };
}

const creado = crearMailer();
export const mailer: Mailer = creado.mailer;
export const mailerReal = creado.real;

// Llamado desde api/worker.ts al arrancar (es el proceso que de verdad envía correo), igual que
// advertirSiNoHayAntivirus/advertirSiNoHayCaptchaReal.
export function advertirSiNoHayMailerReal(real: boolean): void {
  if (!real) {
    logger.warn("No hay Mailer real configurado (ConsoleMailer): los correos salientes se registran en el log, no se envían de verdad");
  }
}
