import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { Departamento } from "../entities/Departamento.js";
import { TemaAyuda } from "../entities/TemaAyuda.js";
import { Rol } from "../entities/enums.js";
import { conectarBD, crearSesion, limpiarBD } from "../test/helpers.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

describe("GET /api/v1/temas-ayuda: rol lectura o superior", () => {
  it.each([Rol.LECTURA, Rol.TECNICO, Rol.GESTION, Rol.ADMIN])("%s puede listar, ordenado por orden y luego nombre", async (rol) => {
    const { auth } = await crearSesion(rol);
    await AppDataSource.getRepository(TemaAyuda).save([
      { nombre: "Zeta", orden: 1 },
      { nombre: "Alfa", orden: 1 },
      { nombre: "Beta", orden: 0 },
    ]);

    const res = await request(app).get("/api/v1/temas-ayuda").set("Authorization", auth);

    expect(res.status).toBe(200);
    expect(res.body.data.map((t: { nombre: string }) => t.nombre)).toEqual(["Beta", "Alfa", "Zeta"]);
    expect(res.body.data[0]).toEqual({
      id: expect.any(String),
      nombre: "Beta",
      activo: true,
      esPublico: true,
      departamento: null,
      prioridadSugerida: null,
      orden: 0,
    });
  });

  it("trae su departamento sugerido si lo tiene (cascada de lectura tema→departamento)", async () => {
    const { auth } = await crearSesion(Rol.LECTURA);
    const departamento = await AppDataSource.getRepository(Departamento).save({ nombre: "Soporte técnico" });
    await AppDataSource.getRepository(TemaAyuda).save({ nombre: "Falla de hardware", departamentoId: departamento.id });

    const res = await request(app).get("/api/v1/temas-ayuda").set("Authorization", auth);

    expect(res.status).toBe(200);
    expect(res.body.data[0].departamento).toEqual({ id: departamento.id, nombre: "Soporte técnico" });
  });

  it("sin token: 401", async () => {
    const res = await request(app).get("/api/v1/temas-ayuda");

    expect(res.status).toBe(401);
  });
});

describe("escritura de temas de ayuda: solo admin", () => {
  it.each([Rol.LECTURA, Rol.TECNICO, Rol.GESTION])("%s recibe 403 en POST y PATCH", async (rol) => {
    const { auth } = await crearSesion(rol);
    const tema = await AppDataSource.getRepository(TemaAyuda).save({ nombre: "Existente" });

    const post = await request(app).post("/api/v1/temas-ayuda").set("Authorization", auth).send({ nombre: "Nuevo" });
    const patch = await request(app).patch(`/api/v1/temas-ayuda/${tema.id}`).set("Authorization", auth).send({ activo: false });

    expect(post.status).toBe(403);
    expect(patch.status).toBe(403);
    expect(await AppDataSource.getRepository(TemaAyuda).count()).toBe(1);
  });

  it("admin crea un tema de ayuda con departamento y prioridad sugerida", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);
    const departamento = await AppDataSource.getRepository(Departamento).save({ nombre: "Soporte técnico" });

    const res = await request(app)
      .post("/api/v1/temas-ayuda")
      .set("Authorization", auth)
      .send({ nombre: "Falla de hardware", departamentoId: departamento.id, prioridadSugerida: "alta", orden: 2 });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      id: expect.any(String),
      nombre: "Falla de hardware",
      activo: true,
      esPublico: true,
      departamento: { id: departamento.id, nombre: "Soporte técnico" },
      prioridadSugerida: "alta",
      orden: 2,
    });
  });

  it("nombre duplicado: 409", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);
    await request(app).post("/api/v1/temas-ayuda").set("Authorization", auth).send({ nombre: "Falla de hardware" });

    const res = await request(app).post("/api/v1/temas-ayuda").set("Authorization", auth).send({ nombre: "Falla de hardware" });

    expect(res.status).toBe(409);
  });

  it("nombre vacío: 400", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);

    const res = await request(app).post("/api/v1/temas-ayuda").set("Authorization", auth).send({ nombre: "   " });

    expect(res.status).toBe(400);
  });

  it("departamentoId inexistente: 400 DEPARTAMENTO_INVALIDO", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);

    const res = await request(app)
      .post("/api/v1/temas-ayuda")
      .set("Authorization", auth)
      .send({ nombre: "Falla de hardware", departamentoId: "11111111-1111-4111-8111-111111111111" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("DEPARTAMENTO_INVALIDO");
  });

  it("admin desactiva, renombra y quita el departamento (PATCH acepta null)", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);
    const departamento = await AppDataSource.getRepository(Departamento).save({ nombre: "Soporte técnico" });
    const tema = await AppDataSource.getRepository(TemaAyuda).save({ nombre: "Viejo", departamentoId: departamento.id });

    const res = await request(app)
      .patch(`/api/v1/temas-ayuda/${tema.id}`)
      .set("Authorization", auth)
      .send({ nombre: "Nuevo nombre", activo: false, departamentoId: null });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      id: tema.id,
      nombre: "Nuevo nombre",
      activo: false,
      esPublico: true,
      departamento: null,
      prioridadSugerida: null,
      orden: 0,
    });
  });

  it("PATCH a un tema inexistente: 404", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);

    const res = await request(app)
      .patch("/api/v1/temas-ayuda/00000000-0000-4000-8000-000000000000")
      .set("Authorization", auth)
      .send({ activo: false });

    expect(res.status).toBe(404);
  });
});
