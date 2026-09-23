import { AppDataSource } from "../config/dataSource.js";
import { CONFIGURACION_CORREO_ID, ConfiguracionCorreo } from "../entities/ConfiguracionCorreo.js";
import { cifrar, descifrar } from "./cifrado.service.js";

export interface CorreoConfigDto {
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
  actualizadoEn: Date | null;
}

// Estado válido "todavía sin configurar" (sin fila en BD): nunca se lanza error por esto, es el
// estado normal antes del primer PUT /correo/config.
const CONFIG_VACIA: CorreoConfigDto = {
  imapHost: null,
  imapPort: null,
  imapUser: null,
  imapFolder: null,
  imapTls: true,
  imapHabilitado: false,
  tieneImapPassword: false,
  smtpHost: null,
  smtpPort: null,
  smtpUser: null,
  smtpTls: true,
  smtpHabilitado: false,
  tieneSmtpPassword: false,
  correoDesde: null,
  dominio: null,
  actualizadoEn: null,
};

function toDto(fila: ConfiguracionCorreo, tieneImapPassword: boolean, tieneSmtpPassword: boolean): CorreoConfigDto {
  return {
    imapHost: fila.imapHost,
    imapPort: fila.imapPort,
    imapUser: fila.imapUser,
    imapFolder: fila.imapFolder,
    imapTls: fila.imapTls,
    imapHabilitado: fila.imapHabilitado,
    tieneImapPassword,
    smtpHost: fila.smtpHost,
    smtpPort: fila.smtpPort,
    smtpUser: fila.smtpUser,
    smtpTls: fila.smtpTls,
    smtpHabilitado: fila.smtpHabilitado,
    tieneSmtpPassword,
    correoDesde: fila.correoDesde,
    dominio: fila.dominio,
    actualizadoEn: fila.actualizadoEn,
  };
}

// Nunca devuelve las contraseñas (ni cifradas ni menos aún descifradas): select:false ya las deja
// fuera de cualquier find() normal. tieneImapPassword/tieneSmtpPassword se calculan con un segundo
// query que SÍ las trae (addSelect, mismo patrón que auth.service.ts con passwordHash) pero solo
// para convertirlas en un booleano; el valor cifrado nunca sale de esta función.
export async function obtenerConfigCorreo(): Promise<CorreoConfigDto> {
  const repo = AppDataSource.getRepository(ConfiguracionCorreo);
  const fila = await repo.findOne({ where: { id: CONFIGURACION_CORREO_ID } });
  if (!fila) return CONFIG_VACIA;

  const conPasswords = await repo
    .createQueryBuilder("c")
    .addSelect("c.imapPasswordCifrado")
    .addSelect("c.smtpPasswordCifrado")
    .where("c.id = :id", { id: CONFIGURACION_CORREO_ID })
    .getOne();

  return toDto(fila, !!conPasswords?.imapPasswordCifrado, !!conPasswords?.smtpPasswordCifrado);
}

export interface CambioCorreoConfig {
  imapHost?: string | null;
  imapPort?: number | null;
  imapUser?: string | null;
  imapPassword?: string; // texto plano; se cifra antes de guardar. Nunca se acepta ya cifrado.
  imapFolder?: string | null;
  imapTls?: boolean;
  imapHabilitado?: boolean;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUser?: string | null;
  smtpPassword?: string;
  smtpTls?: boolean;
  smtpHabilitado?: boolean;
  correoDesde?: string | null;
  dominio?: string | null;
}

// Upsert de la única fila (mismo patrón "solo se actualiza lo que se envía" que
// sla.config.service.ts::actualizarSlaConfig). Como la fila se carga SIN addSelect de las columnas
// select:false, si imapPassword/smtpPassword no vienen, esas propiedades ni siquiera existen en el
// objeto cargado: repo.save() no las toca y el valor cifrado ya guardado queda intacto.
export async function actualizarConfigCorreo(cambios: CambioCorreoConfig, actorId: string): Promise<CorreoConfigDto> {
  const repo = AppDataSource.getRepository(ConfiguracionCorreo);
  let fila = await repo.findOne({ where: { id: CONFIGURACION_CORREO_ID } });
  if (!fila) {
    fila = repo.create({ id: CONFIGURACION_CORREO_ID });
  }

  if (cambios.imapHost !== undefined) fila.imapHost = cambios.imapHost;
  if (cambios.imapPort !== undefined) fila.imapPort = cambios.imapPort;
  if (cambios.imapUser !== undefined) fila.imapUser = cambios.imapUser;
  if (cambios.imapPassword !== undefined) fila.imapPasswordCifrado = cifrar(cambios.imapPassword);
  if (cambios.imapFolder !== undefined) fila.imapFolder = cambios.imapFolder;
  if (cambios.imapTls !== undefined) fila.imapTls = cambios.imapTls;
  if (cambios.imapHabilitado !== undefined) fila.imapHabilitado = cambios.imapHabilitado;
  if (cambios.smtpHost !== undefined) fila.smtpHost = cambios.smtpHost;
  if (cambios.smtpPort !== undefined) fila.smtpPort = cambios.smtpPort;
  if (cambios.smtpUser !== undefined) fila.smtpUser = cambios.smtpUser;
  if (cambios.smtpPassword !== undefined) fila.smtpPasswordCifrado = cifrar(cambios.smtpPassword);
  if (cambios.smtpTls !== undefined) fila.smtpTls = cambios.smtpTls;
  if (cambios.smtpHabilitado !== undefined) fila.smtpHabilitado = cambios.smtpHabilitado;
  if (cambios.correoDesde !== undefined) fila.correoDesde = cambios.correoDesde;
  if (cambios.dominio !== undefined) fila.dominio = cambios.dominio;

  fila.actualizadoEn = new Date();
  fila.actualizadoPorId = actorId;

  await repo.save(fila);
  return obtenerConfigCorreo();
}

export interface CredencialesCorreo {
  imapHabilitado: boolean;
  imapHost: string | null;
  imapPort: number | null;
  imapUser: string | null;
  imapPassword: string | null; // texto plano, recién descifrado
  imapFolder: string | null;
  imapTls: boolean;
  smtpHabilitado: boolean;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpPassword: string | null;
  smtpTls: boolean;
  correoDesde: string | null;
  dominio: string | null;
}

// USO EXCLUSIVO de mail/outbound/index.ts y mail/ingest/index.ts (nunca un controller): trae las
// contraseñas ya descifradas para que el Mailer/MailboxSource real pueda conectarse de verdad.
// null si todavía no hay ninguna fila (estado "sin configurar").
export async function obtenerCredencialesCorreoDescifradas(): Promise<CredencialesCorreo | null> {
  const fila = await AppDataSource.getRepository(ConfiguracionCorreo)
    .createQueryBuilder("c")
    .addSelect("c.imapPasswordCifrado")
    .addSelect("c.smtpPasswordCifrado")
    .where("c.id = :id", { id: CONFIGURACION_CORREO_ID })
    .getOne();
  if (!fila) return null;

  return {
    imapHabilitado: fila.imapHabilitado,
    imapHost: fila.imapHost,
    imapPort: fila.imapPort,
    imapUser: fila.imapUser,
    imapPassword: fila.imapPasswordCifrado ? descifrar(fila.imapPasswordCifrado) : null,
    imapFolder: fila.imapFolder,
    imapTls: fila.imapTls,
    smtpHabilitado: fila.smtpHabilitado,
    smtpHost: fila.smtpHost,
    smtpPort: fila.smtpPort,
    smtpUser: fila.smtpUser,
    smtpPassword: fila.smtpPasswordCifrado ? descifrar(fila.smtpPasswordCifrado) : null,
    smtpTls: fila.smtpTls,
    correoDesde: fila.correoDesde,
    dominio: fila.dominio,
  };
}
