import "reflect-metadata";
import cron from "node-cron";
import { AppDataSource } from "../config/dataSource.js";
import { logger } from "../config/logger.js";
import { evaluarSla } from "../jobs/slaJob.js";

// Proceso separado (mismo estilo que server.ts, mismo AppDataSource). Sin BullMQ ni pg-boss:
// node-cron alcanza para ~8 usuarios (ver docs/backend-diseno.md sección 5).
async function ejecutarEvaluarSla(): Promise<void> {
  try {
    await evaluarSla();
  } catch (err) {
    logger.error({ err }, "evaluarSla falló");
  }
}

AppDataSource.initialize()
  .then(async () => {
    logger.info("siga-ot worker escuchando");
    await ejecutarEvaluarSla(); // una vez al arrancar, sin esperar el primer tick del cron
    cron.schedule("*/5 * * * *", ejecutarEvaluarSla);
  })
  .catch((error) => {
    logger.fatal({ err: error }, "Error al conectar la base de datos (worker)");
    process.exit(1);
  });
