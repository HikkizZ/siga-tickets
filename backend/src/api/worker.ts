import "reflect-metadata";
import cron from "node-cron";
import { AppDataSource } from "../config/dataSource.js";
import { logger } from "../config/logger.js";
import { evaluarSla } from "../jobs/slaJob.js";
import { procesarCorreoSaliente } from "../jobs/correoSalienteJob.js";
import { procesarIngesta } from "../jobs/ingestaCorreoJob.js";
import { advertirSiNoHayMailerReal, mailerReal } from "../mail/outbound/index.js";
import { advertirSiNoHayMailboxReal, mailboxSourceReal } from "../mail/ingest/index.js";

// Proceso separado (mismo estilo que server.ts, mismo AppDataSource). Sin BullMQ ni pg-boss:
// node-cron alcanza para ~8 usuarios (ver docs/backend-diseno.md sección 5).
async function ejecutarEvaluarSla(): Promise<void> {
  try {
    await evaluarSla();
  } catch (err) {
    logger.error({ err }, "evaluarSla falló");
  }
}

// Fase 5: outbox de correo saliente, cada 30 s (más seguido que el SLA porque un correo demorado
// es más visible para el usuario que un recálculo de SLA).
async function ejecutarProcesarCorreo(): Promise<void> {
  try {
    await procesarCorreoSaliente();
  } catch (err) {
    logger.error({ err }, "procesarCorreoSaliente falló");
  }
}

// Fase 6: ingesta de correo entrante. Intervalo elegido: cada 2 minutos — más espaciado que el
// correo saliente (30 s, más visible para el usuario que espera una respuesta) pero bastante más
// seguido que el SLA (5 min): un ticket nuevo por correo debería aparecer en la mesa de ayuda casi
// en tiempo real sin golpear el buzón IMAP con demasiada frecuencia.
async function ejecutarIngestaCorreo(): Promise<void> {
  try {
    await procesarIngesta();
  } catch (err) {
    logger.error({ err }, "procesarIngesta falló");
  }
}

AppDataSource.initialize()
  .then(async () => {
    logger.info("siga-ot worker escuchando");
    advertirSiNoHayMailerReal(mailerReal);
    advertirSiNoHayMailboxReal(mailboxSourceReal);
    // Los tres jobs corren una vez al arrancar, sin esperar el primer tick del cron.
    await ejecutarEvaluarSla();
    await ejecutarProcesarCorreo();
    await ejecutarIngestaCorreo();
    cron.schedule("*/5 * * * *", ejecutarEvaluarSla);
    cron.schedule("*/30 * * * * *", ejecutarProcesarCorreo);
    cron.schedule("*/2 * * * *", ejecutarIngestaCorreo);
  })
  .catch((error) => {
    logger.fatal({ err: error }, "Error al conectar la base de datos (worker)");
    process.exit(1);
  });
