import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { Departamento } from "../entities/Departamento.js";
import { Rol } from "../entities/enums.js";
import { conectarBD, crearSesion, limpiarBD } from "../test/helpers.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

describe("GET /api/v1/departamentos: rol lectura o superior", () => {
  it.each([Rol.LECTURA, Rol.TECNICO, Rol.GESTION, Rol.ADMIN])("%s puede listar", async (rol) => {
    const { auth } = await crearSesion(rol);
    await AppDataSource.getRepository(Departamento).save([{ nombre: "Soporte técnico" }, { nombre: "Administración" }]);

    const res = await request(app).get("/api/v1/departamentos").set("Authorization", auth);

    expect(res.status).toBe(200);
    expect(res.body.data.map((d: { nombre: string }) => d.nombre)).toEqual(["Administración", "Soporte técnico"]);
    expect(res.body.data[0]).toEqual({ id: expect.any(String), nombre: "Administración", activo: true });
  });

  it("sin token: 401", async () => {
    const res = await request(app).get("/api/v1/departamentos");

    expect(res.status).toBe(401);
  });
});

describe("escritura de departamentos: solo admin", () => {
  it.each([Rol.LECTURA, Rol.TECNICO, Rol.GESTION])("%s recibe 403 en POST y PATCH", async (rol) => {
    const { auth } = await crearSesion(rol);
    const departamento = await AppDataSource.getRepository(Departamento).save({ nombre: "Existente" });

    const post = await request(app).post("/api/v1/departamentos").set("Authorization", auth).send({ nombre: "Nuevo" });
    const patch = await request(app)
      .patch(`/api/v1/departamentos/${departamento.id}`)
      .set("Authorization", auth)
      .send({ activo: false });

    expect(post.status).toBe(403);
    expect(patch.status).toBe(403);
    expect(await AppDataSource.getRepository(Departamento).count()).toBe(1);
  });

  it("admin crea un departamento (con trim del nombre)", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);

    const res = await request(app).post("/api/v1/departamentos").set("Authorization", auth).send({ nombre: "  Soporte técnico  " });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ id: expect.any(String), nombre: "Soporte técnico", activo: true });
  });

  it("nombre duplicado: 409", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);
    await request(app).post("/api/v1/departamentos").set("Authorization", auth).send({ nombre: "Soporte técnico" });

    const res = await request(app).post("/api/v1/departamentos").set("Authorization", auth).send({ nombre: "Soporte técnico" });

    expect(res.status).toBe(409);
  });

  it("nombre vacío: 400", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);

    const res = await request(app).post("/api/v1/departamentos").set("Authorization", auth).send({ nombre: "   " });

    expect(res.status).toBe(400);
  });

  it("admin desactiva y renombra (mismo criterio que cliente.activo: sin DELETE)", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);
    const departamento = await AppDataSource.getRepository(Departamento).save({ nombre: "Viejo" });

    const res = await request(app)
      .patch(`/api/v1/departamentos/${departamento.id}`)
      .set("Authorization", auth)
      .send({ nombre: "Nuevo nombre", activo: false });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: departamento.id, nombre: "Nuevo nombre", activo: false });
  });

  it("PATCH a un departamento inexistente: 404", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);

    const res = await request(app)
      .patch("/api/v1/departamentos/00000000-0000-4000-8000-000000000000")
      .set("Authorization", auth)
      .send({ activo: false });

    expect(res.status).toBe(404);
  });
});
