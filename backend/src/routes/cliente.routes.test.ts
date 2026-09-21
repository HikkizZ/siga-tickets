import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { Cliente } from "../entities/Cliente.js";
import { Rol } from "../entities/enums.js";
import { conectarBD, crearSesion, limpiarBD } from "../test/helpers.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

describe("GET /api/v1/clientes: rol lectura o superior", () => {
  it.each([Rol.LECTURA, Rol.TECNICO, Rol.GESTION, Rol.ADMIN])("%s puede listar", async (rol) => {
    const { auth } = await crearSesion(rol);
    await AppDataSource.getRepository(Cliente).save([{ nombre: "Retail Nova" }, { nombre: "Minera Los Andes" }]);

    const res = await request(app).get("/api/v1/clientes").set("Authorization", auth);

    expect(res.status).toBe(200);
    expect(res.body.data.map((c: { nombre: string }) => c.nombre)).toEqual(["Minera Los Andes", "Retail Nova"]);
    expect(res.body.data[0]).toEqual({ id: expect.any(String), nombre: "Minera Los Andes", activo: true });
  });

  it("sin token: 401", async () => {
    const res = await request(app).get("/api/v1/clientes");

    expect(res.status).toBe(401);
  });
});

describe("escritura de clientes: solo admin", () => {
  it.each([Rol.LECTURA, Rol.TECNICO, Rol.GESTION])("%s recibe 403 en POST y PATCH", async (rol) => {
    const { auth } = await crearSesion(rol);
    const cliente = await AppDataSource.getRepository(Cliente).save({ nombre: "Existente" });

    const post = await request(app).post("/api/v1/clientes").set("Authorization", auth).send({ nombre: "Nuevo" });
    const patch = await request(app)
      .patch(`/api/v1/clientes/${cliente.id}`)
      .set("Authorization", auth)
      .send({ activo: false });

    expect(post.status).toBe(403);
    expect(patch.status).toBe(403);
    expect(await AppDataSource.getRepository(Cliente).count()).toBe(1);
  });

  it("admin crea un cliente (con trim del nombre)", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);

    const res = await request(app).post("/api/v1/clientes").set("Authorization", auth).send({ nombre: "  Nuevo SA  " });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ id: expect.any(String), nombre: "Nuevo SA", activo: true });
  });

  it("nombre duplicado: 409", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);
    await request(app).post("/api/v1/clientes").set("Authorization", auth).send({ nombre: "Nuevo SA" });

    const res = await request(app).post("/api/v1/clientes").set("Authorization", auth).send({ nombre: "Nuevo SA" });

    expect(res.status).toBe(409);
  });

  it("nombre vacío: 400", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);

    const res = await request(app).post("/api/v1/clientes").set("Authorization", auth).send({ nombre: "   " });

    expect(res.status).toBe(400);
  });

  it("admin desactiva y renombra (soft delete: la fila sigue en el listado)", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);
    const cliente = await AppDataSource.getRepository(Cliente).save({ nombre: "Viejo" });

    const res = await request(app)
      .patch(`/api/v1/clientes/${cliente.id}`)
      .set("Authorization", auth)
      .send({ nombre: "Nuevo nombre", activo: false });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: cliente.id, nombre: "Nuevo nombre", activo: false });
  });

  it("PATCH a un cliente inexistente: 404", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);

    const res = await request(app)
      .patch("/api/v1/clientes/00000000-0000-4000-8000-000000000000")
      .set("Authorization", auth)
      .send({ activo: false });

    expect(res.status).toBe(404);
  });
});
