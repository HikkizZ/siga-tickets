import "dotenv/config";
import { z } from "zod";

// El diseño exige timestamptz y proceso en UTC: se fija antes de que nada use Date.
process.env.TZ = "UTC";

const esquema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3002),
    DB_HOST: z.string().min(1),
    DB_PORT: z.coerce.number().int().positive().default(1433),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string().min(1),
    DB_NAME: z.string().min(1),
    // z.coerce.boolean() trataría "false" como true: se compara el texto.
    DB_ENCRYPT: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
    DB_TRUST_SERVER_CERTIFICATE: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
    JWT_SECRET: z.string().min(32, "JWT_SECRET debe tener al menos 32 caracteres"),
    JWT_EXPIRES_IN: z.string().default("2h"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  })
  .refine((e) => !(e.NODE_ENV === "production" && e.JWT_SECRET.startsWith("cambia-esto")), {
    message: "JWT_SECRET sigue con el valor de ejemplo",
    path: ["JWT_SECRET"],
  });

const resultado = esquema.safeParse(process.env);

// Falla rápido y con todos los problemas juntos, antes de abrir la BD o el puerto.
if (!resultado.success) {
  const detalle = resultado.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Variables de entorno inválidas:\n${detalle}`);
}

const e = resultado.data;

export const env = {
  nodeEnv: e.NODE_ENV,
  port: e.PORT,
  logLevel: e.LOG_LEVEL,
  db: {
    host: e.DB_HOST,
    port: e.DB_PORT,
    user: e.DB_USER,
    password: e.DB_PASSWORD,
    name: e.DB_NAME,
    encrypt: e.DB_ENCRYPT,
    trustServerCertificate: e.DB_TRUST_SERVER_CERTIFICATE,
  },
  jwt: { secret: e.JWT_SECRET, expiresIn: e.JWT_EXPIRES_IN },
};
