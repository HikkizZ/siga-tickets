import { logger } from "../../config/logger.js";
import { obtenerCredencialesCorreoDescifradas } from "../../services/correoConfig.service.js";
import type { Mailer } from "./Mailer.js";
import { ConsoleMailer } from "./Mailer.js";
import { SmtpMailer } from "./SmtpMailer.js";

// Fase A: la config del buzón ya no es un singleton fijado al importar el módulo (Fase 5) — vive en
// ConfiguracionCorreo (BD) y un admin puede cambiarla en caliente sin reiniciar el proceso. Por eso
// esto es una función async que se llama DESDE jobs/correoSalienteJob.ts EN CADA corrida, nunca una
// vez al cargar el módulo.
export async function crearMailer(): Promise<{ mailer: Mailer; real: boolean }> {
  const cred = await obtenerCredencialesCorreoDescifradas();
  if (cred?.smtpHabilitado && cred.smtpHost && cred.smtpUser && cred.smtpPassword && cred.correoDesde) {
    return {
      mailer: new SmtpMailer({
        host: cred.smtpHost,
        port: cred.smtpPort ?? 587,
        user: cred.smtpUser,
        pass: cred.smtpPassword,
        tls: cred.smtpTls,
        correoDesde: cred.correoDesde,
      }),
      real: true,
    };
  }
  return { mailer: new ConsoleMailer(), real: false };
}

// Llamado desde api/worker.ts al arrancar, una sola vez, best-effort (consulta la BD directamente):
// no hay forma barata de "avisar en caliente" cada vez que la config cambia sin volver a golpear la
// BD en cada tick del cron solo para loguear, así que se deja como un chequeo al arrancar, igual
// que advertirSiNoHayAntivirus/advertirSiNoHayCaptchaReal (decisión documentada en
// docs/backend-diseno.md, sección de esta fase).
export async function advertirSiNoHayMailerReal(): Promise<void> {
  const { real } = await crearMailer();
  if (!real) {
    logger.warn("No hay Mailer real configurado (ConsoleMailer): los correos salientes se registran en el log, no se envían de verdad");
  }
}
