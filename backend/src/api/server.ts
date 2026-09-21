import { AppDataSource } from "../config/dataSource.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { advertirSiNoHayAntivirus } from "../storage/antivirus.js";
import { antivirus } from "../storage/index.js";
import { app } from "./app.js";

AppDataSource.initialize()
  .then(() => {
    advertirSiNoHayAntivirus(antivirus);
    app.listen(env.port, () => {
      logger.info(`siga-ot backend escuchando en puerto ${env.port}`);
    });
  })
  .catch((error) => {
    logger.fatal({ err: error }, "Error al conectar la base de datos");
    process.exit(1);
  });
