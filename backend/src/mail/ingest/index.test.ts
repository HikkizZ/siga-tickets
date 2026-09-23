import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppDataSource } from "../../config/dataSource.js";
import { Usuario } from "../../entities/Usuario.js";
import { Rol } from "../../entities/enums.js";
import { actualizarConfigCorreo } from "../../services/correoConfig.service.js";
import { conectarBD, limpiarBD } from "../../test/helpers.js";
import { crearMailboxSource } from "./index.js";
import { ImapMailboxSource } from "./ImapMailboxSource.js";
import { NoopMailboxSource } from "./NoopMailboxSource.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

async function crearActor(): Promise<string> {
  const usuario = await AppDataSource.getRepository(Usuario).save({
    username: "admin_mailbox_factory",
    nombre: "Admin",
    cargo: null,
    email: "admin_mailbox_factory@test.local",
    passwordHash: "x".repeat(60),
    rol: Rol.ADMIN,
    activo: true,
    mustChangePassword: false,
  });
  return usuario.id;
}

// Fase A: crearMailboxSource() lee ConfiguracionCorreo en BD en cada llamada (ya no un singleton
// fijado al importar el módulo), así que se prueba contra la BD real de test, no con mocks.
describe("mail/ingest/index.ts::crearMailboxSource", () => {
  it("sin ninguna fila en configuracion_correo, cae a NoopMailboxSource", async () => {
    const { source, real } = await crearMailboxSource();
    expect(real).toBe(false);
    expect(source).toBeInstanceOf(NoopMailboxSource);
  });

  it("con imapHabilitado=false (aunque haya host/usuario/contraseña), cae a NoopMailboxSource", async () => {
    const actorId = await crearActor();
    await actualizarConfigCorreo(
      { imapHost: "imap.ejemplo.cl", imapUser: "buzon@ejemplo.cl", imapPassword: "clave", imapHabilitado: false },
      actorId,
    );

    const { source, real } = await crearMailboxSource();
    expect(real).toBe(false);
    expect(source).toBeInstanceOf(NoopMailboxSource);
  });

  it("habilitado pero incompleto (sin contraseña), cae a NoopMailboxSource", async () => {
    const actorId = await crearActor();
    await actualizarConfigCorreo({ imapHost: "imap.ejemplo.cl", imapUser: "buzon@ejemplo.cl", imapHabilitado: true }, actorId);

    const { source, real } = await crearMailboxSource();
    expect(real).toBe(false);
    expect(source).toBeInstanceOf(NoopMailboxSource);
  });

  it("habilitado y completo, usa ImapMailboxSource real", async () => {
    const actorId = await crearActor();
    await actualizarConfigCorreo(
      {
        imapHost: "imap.ejemplo.cl",
        imapPort: 993,
        imapUser: "buzon@ejemplo.cl",
        imapPassword: "clave",
        imapFolder: "INBOX",
        imapHabilitado: true,
      },
      actorId,
    );

    const { source, real } = await crearMailboxSource();
    expect(real).toBe(true);
    expect(source).toBeInstanceOf(ImapMailboxSource);
    expect(source.nombre()).toBe("imap:INBOX");
  });
});
