import { DataSource } from "typeorm";
import { AppDataSource } from "../config/dataSource.js";
import { env } from "../config/env.js";

// Crea siga-tickets-test si no existe y le aplica las migraciones (idempotente).
// La BD se crea SIN COLLATE explícito, con la colación del servidor: si el servidor no fuera
// Modern_Spanish_CI_AS, el test de colación de esquema.test.ts lo delata en vez de ocultarlo.
export default async function setup(): Promise<void> {
  // Nunca se crea ni se migra otra cosa que una BD *-test (y el nombre va entre corchetes).
  if (!/^[A-Za-z0-9_-]+-test$/.test(env.db.name)) {
    throw new Error(`Los tests solo corren contra una BD *-test, no ${env.db.name}`);
  }

  const master = new DataSource({
    type: "mssql",
    host: env.db.host,
    port: env.db.port,
    username: env.db.user,
    password: env.db.password,
    database: "master",
    options: { encrypt: env.db.encrypt, trustServerCertificate: env.db.trustServerCertificate },
  });
  await master.initialize();
  try {
    await master.query(`IF DB_ID(@0) IS NULL EXEC('CREATE DATABASE [${env.db.name}]')`, [env.db.name]);
  } finally {
    await master.destroy();
  }

  await AppDataSource.initialize();
  await AppDataSource.runMigrations();
  await AppDataSource.destroy();
}
