import "reflect-metadata";
import { DataSource } from "typeorm";
import { SnakeNamingStrategy } from "typeorm-naming-strategies";
import { env } from "./env.js";
import { entidades } from "../entities/index.js";
import { ActualizadoEnSubscriber } from "../entities/ActualizadoEnSubscriber.js";
import { EsquemaInicial1789948800000 } from "../migrations/1789948800000-EsquemaInicial.js";

export const AppDataSource = new DataSource({
  type: "mssql",
  host: env.db.host,
  port: env.db.port,
  username: env.db.user,
  password: env.db.password,
  database: env.db.name,
  // localhost usa un certificado autofirmado: en dev se activa DB_TRUST_SERVER_CERTIFICATE.
  // Con encrypt=true y un certificado válido (producción) debe dejarse en false.
  options: {
    encrypt: env.db.encrypt,
    trustServerCertificate: env.db.trustServerCertificate,
  },
  namingStrategy: new SnakeNamingStrategy(),
  // SIEMPRE false: synchronize borraría los CHECK, índices filtrados, la columna calculada y los
  // triggers, que TypeORM no modela. Todo cambio de esquema es una migración.
  synchronize: false,
  entities: entidades,
  subscribers: [ActualizadoEnSubscriber],
  migrations: [EsquemaInicial1789948800000],
});
