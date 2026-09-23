import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppDataSource } from "../config/dataSource.js";
import { Rol } from "../entities/enums.js";
import { adjuntoFake, correoEntranteFake, mailboxSourceFalsa } from "../test/correoHelpers.js";
import { conectarBD, crearUsuarioSistemaTest, limpiarBD } from "../test/helpers.js";
import { crearSesionNombrada } from "../test/otHelpers.js";
import { crearTicketApi } from "../test/ticketHelpers.js";
import { procesarIngesta } from "./ingestaCorreoJob.js";

beforeAll(conectarBD);
beforeEach(async () => {
  await limpiarBD();
  await crearUsuarioSistemaTest();
});
afterAll(() => AppDataSource.destroy());

async function cursorGuardado(origen: string): Promise<string | null> {
  const [fila] = await AppDataSource.query(`SELECT [cursor] FROM mailbox_cursor WHERE origen = @0`, [origen]);
  return fila?.cursor ?? null;
}

describe("procesarIngesta", () => {
  it("sin fila previa en mailbox_cursor: la primera llamada recibe cursor=null y guarda el cursor devuelto", async () => {
    const origen = "fake-1";
    const correo = correoEntranteFake();
    const { source, cursoresRecibidos } = mailboxSourceFalsa(origen, [{ mensajes: [correo], cursor: "42" }]);

    await procesarIngesta(source);

    expect(cursoresRecibidos).toEqual([null]);
    expect(await cursorGuardado(origen)).toBe("42");
    const [{ n }] = await AppDataSource.query(`SELECT COUNT(*) AS n FROM correo_ingerido WHERE origen = @0`, [origen]);
    expect(Number(n)).toBe(1);
  });

  it("el cursor se persiste y se retoma correctamente entre dos llamadas al job", async () => {
    const origen = "fake-2";
    const correo1 = correoEntranteFake();
    const correo2 = correoEntranteFake();
    const { source, cursoresRecibidos } = mailboxSourceFalsa(origen, [
      { mensajes: [correo1], cursor: "10" },
      { mensajes: [correo2], cursor: "25" },
    ]);

    await procesarIngesta(source);
    await procesarIngesta(source);

    expect(cursoresRecibidos).toEqual([null, "10"]); // la 2ª llamada recibió el cursor que dejó la 1ª
    expect(await cursorGuardado(origen)).toBe("25");
    const [{ n }] = await AppDataSource.query(`SELECT COUNT(*) AS n FROM correo_ingerido WHERE origen = @0`, [origen]);
    expect(Number(n)).toBe(2);
  });

  it("un mensaje que falla a mitad de camino no impide que se procesen los demás del lote, y el cursor igual avanza", async () => {
    const origen = "fake-3";
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_job_ingesta");
    const ticket = await crearTicketApi(admin.auth);
    await AppDataSource.query(
      `INSERT INTO mensaje_ticket (ticket_id, tipo, autor_id, cuerpo, message_id) VALUES (@0, 'respuesta_cliente', @1, 'hola', @2)`,
      [ticket.id, admin.usuario.id, "<orig-job@siga-ot.local>"],
    );

    const correoOk1 = correoEntranteFake({ asunto: "Primer ticket nuevo" });
    const nueveMb = 9 * 1024 * 1024;
    const correoFalla = correoEntranteFake({
      inReplyTo: "<orig-job@siga-ot.local>",
      adjuntos: [
        adjuntoFake({ nombre: "a.pdf", mime: "application/pdf", tamano: nueveMb }),
        adjuntoFake({ nombre: "b.pdf", mime: "application/pdf", tamano: nueveMb }),
        adjuntoFake({ nombre: "c.pdf", mime: "application/pdf", tamano: nueveMb }),
      ],
    });
    const correoOk2 = correoEntranteFake({ asunto: "Segundo ticket nuevo" });

    const { source } = mailboxSourceFalsa(origen, [{ mensajes: [correoOk1, correoFalla, correoOk2], cursor: "99" }]);

    await procesarIngesta(source);

    const filas: Array<{ message_id: string; estado: string }> = await AppDataSource.query(
      `SELECT message_id, estado FROM correo_ingerido WHERE origen = @0 ORDER BY recibido_en`,
      [origen],
    );
    expect(filas).toHaveLength(3);
    const porId = Object.fromEntries(filas.map((f) => [f.message_id, f.estado]));
    expect(porId[correoOk1.messageId]).toBe("procesado");
    expect(porId[correoFalla.messageId]).toBe("error");
    expect(porId[correoOk2.messageId]).toBe("procesado");
    // el cursor avanza igual: cada mensaje ya quedó registrado de forma durable (procesado o error)
    expect(await cursorGuardado(origen)).toBe("99");
  }, 20000);

  it("sin mensajes nuevos: no falla y deja el cursor igual (o en '0' la primera vez)", async () => {
    const origen = "fake-4";
    const { source } = mailboxSourceFalsa(origen, []);

    await expect(procesarIngesta(source)).resolves.toBeUndefined();

    expect(await cursorGuardado(origen)).toBe("0");
  });
});
