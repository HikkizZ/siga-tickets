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
    ADJUNTOS_DIR: z.string().min(1).default("./storage/adjuntos"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    // Fase 5 (portal público + correo saliente): "turnstile"/"hcaptcha" son huecos para el futuro,
    // sin credenciales todavía (no se implementan de verdad); "smtp" idem, requiere SMTP_*.
    CAPTCHA_PROVIDER: z.enum(["noop", "turnstile", "hcaptcha"]).default("noop"),
    MAIL_PROVIDER: z.enum(["consola", "smtp"]).default("consola"),
    SOPORTE_EMAIL: z.string().email().default("soporte@sigaltda.cl"),
    MAIL_DOMINIO: z.string().min(1).default("siga-ot.local"),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    // Fase 6 (ingesta de correo): "graph" queda en el tipo como hueco para el futuro (mismo
    // espíritu que CAPTCHA_PROVIDER en la Fase 5), no se implementa de verdad todavía. Sin
    // IMAP_HOST configurado se usa NoopMailboxSource (no falla al arrancar).
    MAILBOX_PROVIDER: z.enum(["imap", "graph"]).default("imap"),
    IMAP_HOST: z.string().optional(),
    IMAP_PORT: z.coerce.number().int().positive().default(993),
    IMAP_USER: z.string().optional(),
    IMAP_PASS: z.string().optional(),
    IMAP_TLS: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
    IMAP_FOLDER: z.string().min(1).default("INBOX"),
    // Fase A (config de correo en BD): clave simétrica para cifrar/descifrar imap_password_cifrado/
    // smtp_password_cifrado en configuracion_correo (services/cifrado.service.ts, AES-256-GCM).
    // Hex de 64 caracteres = 32 bytes exactos. Ninguna credencial de correo se guarda en texto
    // plano ni con un hash irreversible: hace falta poder recuperarla para conectarse de verdad.
    MAIL_CREDENTIALS_KEY: z
      .string()
      .length(64, "MAIL_CREDENTIALS_KEY debe ser un string hexadecimal de 64 caracteres (32 bytes)")
      .regex(/^[0-9a-fA-F]+$/, "MAIL_CREDENTIALS_KEY debe ser hexadecimal"),
  })
  .refine((e) => !(e.NODE_ENV === "production" && e.JWT_SECRET.startsWith("cambia-esto")), {
    message: "JWT_SECRET sigue con el valor de ejemplo",
    path: ["JWT_SECRET"],
  })
  .refine((e) => !(e.NODE_ENV === "production" && e.MAIL_CREDENTIALS_KEY === "0".repeat(64)), {
    message: "MAIL_CREDENTIALS_KEY sigue con el valor de ejemplo",
    path: ["MAIL_CREDENTIALS_KEY"],
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
  adjuntosDir: e.ADJUNTOS_DIR,
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
  captcha: { provider: e.CAPTCHA_PROVIDER },
  mail: {
    provider: e.MAIL_PROVIDER,
    soporteEmail: e.SOPORTE_EMAIL,
    dominio: e.MAIL_DOMINIO,
    smtpHost: e.SMTP_HOST,
    smtpPort: e.SMTP_PORT,
    smtpUser: e.SMTP_USER,
    smtpPass: e.SMTP_PASS,
  },
  mailbox: {
    provider: e.MAILBOX_PROVIDER,
    imapHost: e.IMAP_HOST,
    imapPort: e.IMAP_PORT,
    imapUser: e.IMAP_USER,
    imapPass: e.IMAP_PASS,
    imapTls: e.IMAP_TLS,
    imapFolder: e.IMAP_FOLDER,
  },
  mailCredentialsKey: e.MAIL_CREDENTIALS_KEY,
};
