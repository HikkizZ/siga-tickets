import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppDataSource } from "../../config/dataSource.js";
import { Usuario } from "../../entities/Usuario.js";
import { Rol } from "../../entities/enums.js";
import { actualizarConfigCorreo } from "../../services/correoConfig.service.js";
import { conectarBD, limpiarBD } from "../../test/helpers.js";
import { crearMailer } from "./index.js";
import { ConsoleMailer } from "./Mailer.js";
import { SmtpMailer } from "./SmtpMailer.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

async function crearActor(): Promise<string> {
  const usuario = await AppDataSource.getRepository(Usuario).save({
    username: "admin_mailer_factory",
    nombre: "Admin",
    cargo: null,
    email: "admin_mailer_factory@test.local",
    passwordHash: "x".repeat(60),
    rol: Rol.ADMIN,
    activo: true,
    mustChangePassword: false,
  });
  return usuario.id;
}

// Fase A: crearMailer() lee ConfiguracionCorreo en BD en cada llamada (ya no un singleton fijado
// al importar el módulo), así que se prueba contra la BD real de test, no con mocks del módulo.
describe("mail/outbound/index.ts::crearMailer", () => {
  it("sin ninguna fila en configuracion_correo, cae a ConsoleMailer", async () => {
    const { mailer, real } = await crearMailer();
    expect(real).toBe(false);
    expect(mailer).toBeInstanceOf(ConsoleMailer);
  });

  it("con smtpHabilitado=false (aunque haya host/usuario/contraseña), cae a ConsoleMailer", async () => {
    const actorId = await crearActor();
    await actualizarConfigCorreo(
      {
        smtpHost: "smtp.ejemplo.cl",
        smtpUser: "buzon@ejemplo.cl",
        smtpPassword: "clave",
        correoDesde: "Soporte <buzon@ejemplo.cl>",
        smtpHabilitado: false,
      },
      actorId,
    );

    const { mailer, real } = await crearMailer();
    expect(real).toBe(false);
    expect(mailer).toBeInstanceOf(ConsoleMailer);
  });

  it("habilitado pero incompleto (sin correoDesde), cae a ConsoleMailer", async () => {
    const actorId = await crearActor();
    await actualizarConfigCorreo(
      { smtpHost: "smtp.ejemplo.cl", smtpUser: "buzon@ejemplo.cl", smtpPassword: "clave", smtpHabilitado: true },
      actorId,
    );

    const { mailer, real } = await crearMailer();
    expect(real).toBe(false);
    expect(mailer).toBeInstanceOf(ConsoleMailer);
  });

  it("habilitado y completo, usa SmtpMailer real", async () => {
    const actorId = await crearActor();
    await actualizarConfigCorreo(
      {
        smtpHost: "smtp.ejemplo.cl",
        smtpPort: 587,
        smtpUser: "buzon@ejemplo.cl",
        smtpPassword: "clave",
        correoDesde: "Soporte <buzon@ejemplo.cl>",
        smtpHabilitado: true,
      },
      actorId,
    );

    const { mailer, real } = await crearMailer();
    expect(real).toBe(true);
    expect(mailer).toBeInstanceOf(SmtpMailer);
  });
});
