// Funciones de red puras para la configuración del buzón de correo (docs/api.md, sección
// "Configuración de correo (Fase A)"): un único registro (no un CRUD de varios) con IMAP entrante
// y SMTP saliente. Mismo patrón que src/lib/api/sla.ts — sin React ni TanStack Query acá, eso vive
// en src/hooks/useCorreoConfig.ts.
import { apiClient } from "./client";

// Forma de GET /correo/config: nunca trae la contraseña real (ni en texto plano ni cifrada), solo
// `tieneImapPassword`/`tieneSmtpPassword` para que el frontend sepa si ya hay una guardada. Sin
// buzón configurado todavía, el backend devuelve `200` con todos estos campos en `null`/`false`
// (estado válido, no un error).
export type CorreoConfig = {
  imapHost: string | null;
  imapPort: number | null;
  imapUser: string | null;
  imapFolder: string | null;
  imapTls: boolean;
  imapHabilitado: boolean;
  tieneImapPassword: boolean;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpTls: boolean;
  smtpHabilitado: boolean;
  tieneSmtpPassword: boolean;
  correoDesde: string | null;
  dominio: string | null;
  actualizadoEn: string | null;
};

export async function obtenerCorreoConfig(): Promise<CorreoConfig> {
  const { data } = await apiClient.get<CorreoConfig>("/correo/config");
  return data;
}

// PUT /correo/config: body parcial (`.strict()`, solo se actualiza lo que se envía — mismo
// criterio que PUT /sla/config). `imapPassword`/`smtpPassword` van siempre en texto plano (se
// cifran en el servidor) y solo se envían si el usuario escribió una nueva; si no vienen, la
// contraseña ya guardada queda intacta. `tieneImapPassword`/`tieneSmtpPassword` no son campos del
// body: son de solo lectura, calculados por el backend.
export type ActualizarCorreoConfigInput = Partial<
  Omit<CorreoConfig, "tieneImapPassword" | "tieneSmtpPassword" | "actualizadoEn">
> & {
  imapPassword?: string;
  smtpPassword?: string;
};

export async function actualizarCorreoConfig(
  cambios: ActualizarCorreoConfigInput,
): Promise<CorreoConfig> {
  const { data } = await apiClient.put<CorreoConfig>("/correo/config", cambios);
  return data;
}
