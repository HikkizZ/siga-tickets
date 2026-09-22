import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { conectarBD, limpiarBD } from "../test/helpers.js";
import { API, crearSesionNombrada } from "../test/otHelpers.js";
import { ticketBody } from "../test/ticketHelpers.js";
import { Rol } from "../entities/enums.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

describe("POST /tickets", () => {
  it("crea el ticket con folio TK consecutivo, sin responsable, recepcionado_por del token y estado nuevo", async () => {
    const { auth, usuario } = await crearSesionNombrada(Rol.TECNICO, "tecnico_crea");

    const res = await request(app).post(`${API}/tickets`).set("Authorization", auth).send(ticketBody());

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      numero: "TK-0001",
      estado: "nuevo",
      canal: "telefono",
      responsable: null,
      recepcionadoPor: { id: usuario.id },
    });
    expect(res.body.data.primeraRespuestaEn).toBeNull();
    expect(res.body.data.cadenaResponsables).toEqual([]);

    const otro = await request(app).post(`${API}/tickets`).set("Authorization", auth).send(ticketBody());
    expect(otro.body.data.numero).toBe("TK-0002");

    const ev = await AppDataSource.query(`SELECT tipo, payload FROM evento WHERE entidad_tipo = 'ticket'`);
    expect(ev).toHaveLength(2);
    expect(ev[0].tipo).toBe("creado");
    expect(JSON.parse(ev[0].payload)).toEqual({
      numero: "TK-0001",
      canal: "telefono",
      recepcionadoPorId: usuario.id,
      clienteId: null,
    });
  });

  it("recepcionado_por SIEMPRE es el usuario autenticado, aunque el body intente mandar otra cosa", async () => {
    const { auth } = await crearSesionNombrada(Rol.TECNICO, "tecnico_crea2");
    const otro = await crearSesionNombrada(Rol.TECNICO, "otro_tecnico");

    const res = await request(app)
      .post(`${API}/tickets`)
      .set("Authorization", auth)
      .send({ ...ticketBody(), recepcionadoPorId: otro.usuario.id });

    // strict(): un campo no previsto en el body se rechaza.
    expect(res.status).toBe(400);
  });

  it.each(["portal", "correo"])("canal=%s es rechazado (reservado a fases futuras)", async (canal) => {
    const { auth } = await crearSesionNombrada(Rol.TECNICO, "tecnico_canal");

    const res = await request(app).post(`${API}/tickets`).set("Authorization", auth).send(ticketBody({ canal }));

    expect(res.status).toBe(400);
  });

  it.each(["telefono", "presencial", "interno"])("canal=%s es aceptado", async (canal) => {
    const { auth } = await crearSesionNombrada(Rol.TECNICO, "tecnico_canal_ok");

    const res = await request(app).post(`${API}/tickets`).set("Authorization", auth).send(ticketBody({ canal }));

    expect(res.status).toBe(201);
    expect(res.body.data.canal).toBe(canal);
  });

  it("clienteId inactivo o inexistente: 400 CLIENTE_INVALIDO", async () => {
    const { auth } = await crearSesionNombrada(Rol.TECNICO, "tecnico_cliente");

    const res = await request(app)
      .post(`${API}/tickets`)
      .set("Authorization", auth)
      .send(ticketBody({ clienteId: "11111111-1111-4111-8111-111111111111" }));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("CLIENTE_INVALIDO");
  });

  it("lectura no puede crear: 403", async () => {
    const { auth } = await crearSesionNombrada(Rol.LECTURA, "lectura_crea");

    const res = await request(app).post(`${API}/tickets`).set("Authorization", auth).send(ticketBody());

    expect(res.status).toBe(403);
  });
});
