import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { EstadoTicket } from "../entities/EstadoTicket.js";
import { Rol } from "../entities/enums.js";
import { conectarBD, crearSesion, limpiarBD, obtenerEstadoTicketPorNombre } from "../test/helpers.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

describe("GET /api/v1/estados-ticket: rol lectura o superior", () => {
  it.each([Rol.LECTURA, Rol.TECNICO, Rol.GESTION, Rol.ADMIN])("%s puede listar (con la semilla de 5 estados)", async (rol) => {
    const { auth } = await crearSesion(rol);

    const res = await request(app).get("/api/v1/estados-ticket").set("Authorization", auth);

    expect(res.status).toBe(200);
    expect(res.body.data.map((e: { nombre: string }) => e.nombre)).toEqual(["Nuevo", "Abierto", "Esperando cliente", "Resuelto", "Cerrado"]);
    expect(res.body.data[0]).toEqual({
      id: expect.any(String),
      nombre: "Nuevo",
      orden: 1,
      activo: true,
      esEstadoInicial: true,
      esDestinoReapertura: false,
      esPausaSla: false,
      marcaResueltoEn: false,
      marcaCerradoEn: false,
      esTerminal: false,
    });
  });

  it("sin token: 401", async () => {
    const res = await request(app).get("/api/v1/estados-ticket");
    expect(res.status).toBe(401);
  });
});

describe("escritura de estados de ticket: solo admin", () => {
  it.each([Rol.LECTURA, Rol.TECNICO, Rol.GESTION])("%s recibe 403 en POST y PATCH", async (rol) => {
    const { auth } = await crearSesion(rol);
    const nuevo = await obtenerEstadoTicketPorNombre("Nuevo");

    const post = await request(app).post("/api/v1/estados-ticket").set("Authorization", auth).send({ nombre: "En espera" });
    const patch = await request(app).patch(`/api/v1/estados-ticket/${nuevo.id}`).set("Authorization", auth).send({ activo: false });

    expect(post.status).toBe(403);
    expect(patch.status).toBe(403);
  });

  it("admin crea un estado intermedio normal: ningún flag se activa por defecto", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);

    const res = await request(app).post("/api/v1/estados-ticket").set("Authorization", auth).send({ nombre: "En espera de repuesto", orden: 6 });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      nombre: "En espera de repuesto",
      esEstadoInicial: false,
      esDestinoReapertura: false,
      esPausaSla: false,
      marcaResueltoEn: false,
      marcaCerradoEn: false,
      esTerminal: false,
    });
  });

  it("nombre duplicado: 409 CONFLICT", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);

    const res = await request(app).post("/api/v1/estados-ticket").set("Authorization", auth).send({ nombre: "Nuevo" });

    expect(res.status).toBe(409);
  });

  it("PATCH a un estado inexistente: 404", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);

    const res = await request(app)
      .patch("/api/v1/estados-ticket/00000000-0000-4000-8000-000000000000")
      .set("Authorization", auth)
      .send({ activo: false });

    expect(res.status).toBe(404);
  });

  it("esEstadoInicial es exclusivo: marcar una nueva fila desmarca la anterior", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);
    const nuevo = await obtenerEstadoTicketPorNombre("Nuevo");

    const crear = await request(app)
      .post("/api/v1/estados-ticket")
      .set("Authorization", auth)
      .send({ nombre: "Recepcionado", esEstadoInicial: true });
    expect(crear.status).toBe(201);
    expect(crear.body.data.esEstadoInicial).toBe(true);

    const anterior = await AppDataSource.getRepository(EstadoTicket).findOneByOrFail({ id: nuevo.id });
    expect(anterior.esEstadoInicial).toBe(false);

    const filas = await AppDataSource.getRepository(EstadoTicket).find({ where: { esEstadoInicial: true } });
    expect(filas).toHaveLength(1);
    expect(filas[0]!.id).toBe(crear.body.data.id);
  });

  it("esDestinoReapertura es exclusivo: marcar por PATCH desmarca la fila que lo tenía", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);
    const abierto = await obtenerEstadoTicketPorNombre("Abierto");
    const resuelto = await obtenerEstadoTicketPorNombre("Resuelto");
    expect(abierto.esDestinoReapertura).toBe(true);

    const res = await request(app)
      .patch(`/api/v1/estados-ticket/${resuelto.id}`)
      .set("Authorization", auth)
      .send({ esDestinoReapertura: true });
    expect(res.status).toBe(200);
    expect(res.body.data.esDestinoReapertura).toBe(true);

    const filas = await AppDataSource.getRepository(EstadoTicket).find({ where: { esDestinoReapertura: true } });
    expect(filas).toHaveLength(1);
    expect(filas[0]!.id.toLowerCase()).toBe(resuelto.id.toLowerCase());
  });

  it("no permite desmarcar esEstadoInicial de la única fila que lo tiene, sin reemplazo: 400", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);
    const nuevo = await obtenerEstadoTicketPorNombre("Nuevo");

    const res = await request(app).patch(`/api/v1/estados-ticket/${nuevo.id}`).set("Authorization", auth).send({ esEstadoInicial: false });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("ESTADO_TICKET_SIN_REEMPLAZO");
    const fila = await AppDataSource.getRepository(EstadoTicket).findOneByOrFail({ id: nuevo.id });
    expect(fila.esEstadoInicial).toBe(true); // no se aplicó el cambio a medias
  });

  it("no permite desmarcar esDestinoReapertura de la única fila que lo tiene, sin reemplazo: 400", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);
    const abierto = await obtenerEstadoTicketPorNombre("Abierto");

    const res = await request(app).patch(`/api/v1/estados-ticket/${abierto.id}`).set("Authorization", auth).send({ esDestinoReapertura: false });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("ESTADO_TICKET_SIN_REEMPLAZO");
  });

  it("sí permite desmarcar esEstadoInicial si otra fila ya lo tiene marcado en el mismo PATCH previo", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);
    const nuevo = await obtenerEstadoTicketPorNombre("Nuevo");
    const abierto = await obtenerEstadoTicketPorNombre("Abierto");

    const marcarOtra = await request(app)
      .patch(`/api/v1/estados-ticket/${abierto.id}`)
      .set("Authorization", auth)
      .send({ esEstadoInicial: true });
    expect(marcarOtra.status).toBe(200);

    const res = await request(app).patch(`/api/v1/estados-ticket/${nuevo.id}`).set("Authorization", auth).send({ esEstadoInicial: false });
    expect(res.status).toBe(200);
  });
});
