import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppDataSource } from "../config/dataSource.js";
import { CONFIGURACION_CORREO_ID, ConfiguracionCorreo } from "../entities/ConfiguracionCorreo.js";
import { Usuario } from "../entities/Usuario.js";
import { Rol } from "../entities/enums.js";
import { conectarBD, limpiarBD } from "../test/helpers.js";
import { actualizarConfigCorreo, obtenerConfigCorreo, obtenerCredencialesCorreoDescifradas } from "./correoConfig.service.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

async function crearUsuario(): Promise<string> {
  const usuario = await AppDataSource.getRepository(Usuario).save({
    username: "admin_correo_cfg",
    nombre: "Admin",
    cargo: null,
    email: "admin_correo_cfg@test.local",
    passwordHash: "x".repeat(60),
    rol: Rol.ADMIN,
    activo: true,
    mustChangePassword: false,
  });
  return usuario.id;
}

describe("correoConfig.service", () => {
  it("obtenerConfigCorreo() sin fila todavía devuelve un estado vacío/deshabilitado, sin lanzar error", async () => {
    const config = await obtenerConfigCorreo();
    expect(config).toMatchObject({
      imapHost: null,
      imapHabilitado: false,
      tieneImapPassword: false,
      smtpHost: null,
      smtpHabilitado: false,
      tieneSmtpPassword: false,
      actualizadoEn: null,
    });
  });

  it("actualizarConfigCorreo crea la fila (upsert) la primera vez y cifra las contraseñas", async () => {
    const actorId = await crearUsuario();

    const config = await actualizarConfigCorreo(
      {
        imapHost: "imap.ejemplo.cl",
        imapPort: 993,
        imapUser: "buzon@ejemplo.cl",
        imapPassword: "clave-imap-en-texto-plano",
        imapFolder: "INBOX",
        imapHabilitado: true,
        smtpHost: "smtp.ejemplo.cl",
        smtpPort: 587,
        smtpUser: "buzon@ejemplo.cl",
        smtpPassword: "clave-smtp-en-texto-plano",
        smtpHabilitado: true,
        correoDesde: "Soporte <buzon@ejemplo.cl>",
        dominio: "ejemplo.cl",
      },
      actorId,
    );

    // El DTO devuelto (mismo formato que el GET) nunca trae las contraseñas.
    expect(config).not.toHaveProperty("imapPassword");
    expect(config).not.toHaveProperty("imapPasswordCifrado");
    expect(config).not.toHaveProperty("smtpPassword");
    expect(config).not.toHaveProperty("smtpPasswordCifrado");
    expect(config.tieneImapPassword).toBe(true);
    expect(config.tieneSmtpPassword).toBe(true);
    expect(config.imapHost).toBe("imap.ejemplo.cl");
    expect(config.actualizadoEn).not.toBeNull();

    // En la BD la columna NO contiene el texto plano.
    const filaCruda: Array<{ imap_password_cifrado: string; smtp_password_cifrado: string }> = await AppDataSource.query(
      `SELECT imap_password_cifrado, smtp_password_cifrado FROM configuracion_correo WHERE id = @0`,
      [CONFIGURACION_CORREO_ID],
    );
    expect(filaCruda[0]!.imap_password_cifrado).not.toContain("clave-imap-en-texto-plano");
    expect(filaCruda[0]!.smtp_password_cifrado).not.toContain("clave-smtp-en-texto-plano");

    // La función interna (uso exclusivo de los jobs) sí puede recuperar el texto plano exacto.
    const credenciales = await obtenerCredencialesCorreoDescifradas();
    expect(credenciales?.imapPassword).toBe("clave-imap-en-texto-plano");
    expect(credenciales?.smtpPassword).toBe("clave-smtp-en-texto-plano");
  });

  it("un cambio parcial NO toca los campos que no vienen (incluida la contraseña ya guardada)", async () => {
    const actorId = await crearUsuario();
    await actualizarConfigCorreo(
      {
        imapHost: "imap.viejo.cl",
        imapPassword: "clave-original",
        smtpHost: "smtp.viejo.cl",
        smtpPassword: "clave-smtp-original",
        correoDesde: "Viejo <viejo@ejemplo.cl>",
      },
      actorId,
    );

    // Solo se cambia el host de IMAP; todo lo demás (incluidas ambas contraseñas) debe quedar igual.
    const config = await actualizarConfigCorreo({ imapHost: "imap.nuevo.cl" }, actorId);

    expect(config.imapHost).toBe("imap.nuevo.cl");
    expect(config.smtpHost).toBe("smtp.viejo.cl");
    expect(config.correoDesde).toBe("Viejo <viejo@ejemplo.cl>");
    expect(config.tieneImapPassword).toBe(true);
    expect(config.tieneSmtpPassword).toBe(true);

    const credenciales = await obtenerCredencialesCorreoDescifradas();
    expect(credenciales?.imapPassword).toBe("clave-original"); // no se tocó
    expect(credenciales?.smtpPassword).toBe("clave-smtp-original"); // no se tocó
  });

  it("registra actualizadoPorId y sigue siendo una única fila (singleton) tras varios updates", async () => {
    const actorId = await crearUsuario();
    await actualizarConfigCorreo({ imapHost: "a" }, actorId);
    await actualizarConfigCorreo({ imapHost: "b" }, actorId);
    await actualizarConfigCorreo({ imapHost: "c" }, actorId);

    const filas = await AppDataSource.getRepository(ConfiguracionCorreo).find();
    expect(filas).toHaveLength(1);
    expect(filas[0]!.id).toBe(CONFIGURACION_CORREO_ID);
    expect(filas[0]!.actualizadoPorId).toBe(actorId);
  });

  it("obtenerCredencialesCorreoDescifradas() devuelve null si todavía no hay fila", async () => {
    const credenciales = await obtenerCredencialesCorreoDescifradas();
    expect(credenciales).toBeNull();
  });
});
