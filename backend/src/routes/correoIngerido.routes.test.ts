import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { Rol } from "../entities/enums.js";
import { adjuntoFake, correoEntranteFake } from "../test/correoHelpers.js";
import { conectarBD, crearUsuarioSistemaTest, limpiarBD } from "../test/helpers.js";
import { API, crearSesionNombrada } from "../test/otHelpers.js";
import { crearTicketApi } from "../test/ticketHelpers.js";
import { procesarMensajeEntrante } from "../services/correoIngerido.service.js";

beforeAll(conectarBD);
beforeEach(async () => {
  await limpiarBD();
  await crearUsuarioSistemaTest();
});
afterAll(() => AppDataSource.destroy());

async function crearCorreoEnError(): Promise<{ id: string; messageId: string }> {
  const admin = await crearSesionNombrada(Rol.ADMIN, "admin_correo_routes");
  const ticket = await crearTicketApi(admin.auth);
  const messageIdOriginal = "<orig-routes@siga-ot.local>";
  await AppDataSource.query(
    `INSERT INTO mensaje_ticket (ticket_id, tipo, autor_id, cuerpo, message_id) VALUES (@0, 'respuesta_cliente', @1, 'hola', @2)`,
    [ticket.id, admin.usuario.id, messageIdOriginal],
  );
  const nueveMb = 9 * 1024 * 1024;
  const correo = correoEntranteFake({
    inReplyTo: messageIdOriginal,
    adjuntos: [
      adjuntoFake({ nombre: "a.pdf", mime: "application/pdf", tamano: nueveMb }),
      adjuntoFake({ nombre: "b.pdf", mime: "application/pdf", tamano: nueveMb }),
      adjuntoFake({ nombre: "c.pdf", mime: "application/pdf", tamano: nueveMb }),
    ],
  });
  const resultado = await procesarMensajeEntrante(correo, "test-routes");
  expect(resultado).toBe("error");
  const [fila] = await AppDataSource.query(`SELECT id FROM correo_ingerido WHERE message_id = @0`, [correo.messageId]);
  return { id: fila.id, messageId: correo.messageId };
}

describe("GET /correos-ingeridos", () => {
  it("admin: lista paginada, filtro por estado", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_correo_get");
    await procesarMensajeEntrante(correoEntranteFake(), "test-routes");
    const enError = await crearCorreoEnError();

    const res = await request(app).get(`${API}/correos-ingeridos`).set("Authorization", admin.auth);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res.body.meta).toMatchObject({ page: 1, perPage: 25 });

    const soloError = await request(app).get(`${API}/correos-ingeridos?estado=error`).set("Authorization", admin.auth);
    expect(soloError.status).toBe(200);
    expect(soloError.body.data.every((c: { estado: string }) => c.estado === "error")).toBe(true);
    expect(soloError.body.data.some((c: { id: string }) => c.id.toLowerCase() === enError.id.toLowerCase())).toBe(true);
  });

  it.each([Rol.LECTURA, Rol.TECNICO, Rol.GESTION])("%s: 403 (solo admin)", async (rol) => {
    const s = await crearSesionNombrada(rol, `no_admin_correo_${rol}`);
    const res = await request(app).get(`${API}/correos-ingeridos`).set("Authorization", s.auth);
    expect(res.status).toBe(403);
  });

  it("sin token: 401", async () => {
    const res = await request(app).get(`${API}/correos-ingeridos`);
    expect(res.status).toBe(401);
  });
});

describe("POST /correos-ingeridos/:id/reprocesar", () => {
  it("admin, estado='error': reprocesa y NO duplica la fila (mismo message_id)", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_correo_reproc_route");
    const { id, messageId } = await crearCorreoEnError();

    const res = await request(app).post(`${API}/correos-ingeridos/${id}/reprocesar`).set("Authorization", admin.auth);

    expect(res.status).toBe(200);
    expect(res.body.data.id.toLowerCase()).toBe(id.toLowerCase());
    const filas = await AppDataSource.query(`SELECT id FROM correo_ingerido WHERE message_id = @0`, [messageId]);
    expect(filas).toHaveLength(1);
  }, 20000);

  it("estado != 'error': 409 CORREO_INGERIDO_NO_REPROCESABLE", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_correo_no_reproc");
    await procesarMensajeEntrante(correoEntranteFake(), "test-routes");
    const [fila] = await AppDataSource.query(`SELECT TOP 1 id FROM correo_ingerido WHERE estado = 'procesado'`);

    const res = await request(app).post(`${API}/correos-ingeridos/${fila.id}/reprocesar`).set("Authorization", admin.auth);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CORREO_INGERIDO_NO_REPROCESABLE");
  });

  it("id inexistente: 404", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_correo_404");
    const res = await request(app)
      .post(`${API}/correos-ingeridos/00000000-0000-0000-0000-000000000000/reprocesar`)
      .set("Authorization", admin.auth);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("CORREO_INGERIDO_NO_ENCONTRADO");
  });

  it.each([Rol.LECTURA, Rol.TECNICO, Rol.GESTION])("%s: 403 (solo admin)", async (rol) => {
    const s = await crearSesionNombrada(rol, `no_admin_reproc_${rol}`);
    const { id } = await crearCorreoEnError();

    const res = await request(app).post(`${API}/correos-ingeridos/${id}/reprocesar`).set("Authorization", s.auth);
    expect(res.status).toBe(403);
  }, 20000);
});
