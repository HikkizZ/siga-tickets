import "reflect-metadata";
import cron from "node-cron";
import { AppDataSource } from "../config/dataSource.js";
import { logger } from "../config/logger.js";
import { evaluarSla } from "../jobs/slaJob.js";
import { procesarCorreoSaliente } from "../jobs/correoSalienteJob.js";
import { advertirSiNoHayMailerReal, mailerReal } from "../mail/outbound/index.js";

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

AppDataSource.initialize()
  .then(async () => {
    logger.info("siga-ot worker escuchando");
    advertirSiNoHayMailerReal(mailerReal);
    // Ambos jobs corren una vez al arrancar, sin esperar el primer tick del cron.
    await ejecutarEvaluarSla();
    await ejecutarProcesarCorreo();
    cron.schedule("*/5 * * * *", ejecutarEvaluarSla);
    cron.schedule("*/30 * * * * *", ejecutarProcesarCorreo);
  })
  .catch((error) => {
    logger.fatal({ err: error }, "Error al conectar la base de datos (worker)");
    process.exit(1);
  });
