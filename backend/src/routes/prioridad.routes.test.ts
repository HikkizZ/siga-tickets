import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { PlanSla } from "../entities/PlanSla.js";
import { Rol } from "../entities/enums.js";
import { conectarBD, crearSesion, limpiarBD, obtenerPrioridadPorNombre } from "../test/helpers.js";
import { API, crearClienteTest, crearOtApi, crearSesionNombrada } from "../test/otHelpers.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

describe("GET /api/v1/prioridades: rol lectura o superior", () => {
  it.each([Rol.LECTURA, Rol.TECNICO, Rol.GESTION, Rol.ADMIN])("%s puede listar (con la semilla Alta/Media/Baja)", async (rol) => {
    const { auth } = await crearSesion(rol);

    const res = await request(app).get("/api/v1/prioridades").set("Authorization", auth);

    expect(res.status).toBe(200);
    expect(res.body.data.map((p: { nombre: string }) => p.nombre)).toEqual(["Alta", "Media", "Baja"]);
    expect(res.body.data[0]).toMatchObject({ id: expect.any(String), nombre: "Alta", orden: 1, activo: true });
    expect(typeof res.body.data[0].planSlaId).toBe("string");
  });

  it("sin token: 401", async () => {
    const res = await request(app).get("/api/v1/prioridades");
    expect(res.status).toBe(401);
  });
});

describe("escritura de prioridades: solo admin", () => {
  it.each([Rol.LECTURA, Rol.TECNICO, Rol.GESTION])("%s recibe 403 en POST y PATCH", async (rol) => {
    const { auth } = await crearSesion(rol);
    const alta = await obtenerPrioridadPorNombre("Alta");

    const post = await request(app).post("/api/v1/prioridades").set("Authorization", auth).send({ nombre: "Crítica" });
    const patch = await request(app).patch(`/api/v1/prioridades/${alta.id}`).set("Authorization", auth).send({ activo: false });

    expect(post.status).toBe(403);
    expect(patch.status).toBe(403);
  });

  it("admin crea una prioridad sin planSlaId (queda sin SLA)", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);

    const res = await request(app).post("/api/v1/prioridades").set("Authorization", auth).send({ nombre: "Crítica", orden: 0 });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ id: expect.any(String), nombre: "Crítica", orden: 0, activo: true, planSlaId: null });
  });

  it("planSlaId inexistente: 400 PLAN_SLA_INVALIDO", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);

    const res = await request(app)
      .post("/api/v1/prioridades")
      .set("Authorization", auth)
      .send({ nombre: "Crítica", planSlaId: "11111111-1111-4111-8111-111111111111" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("PLAN_SLA_INVALIDO");
  });

  it("nombre duplicado: 409 CONFLICT", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);

    const res = await request(app).post("/api/v1/prioridades").set("Authorization", auth).send({ nombre: "Alta" });

    expect(res.status).toBe(409);
  });

  it("PATCH a una prioridad inexistente: 404", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);

    const res = await request(app)
      .patch("/api/v1/prioridades/00000000-0000-4000-8000-000000000000")
      .set("Authorization", auth)
      .send({ activo: false });

    expect(res.status).toBe(404);
  });

  it("cambiar planSlaId a otro plan recalcula lo abierto (OT y ticket) de esa prioridad", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);
    const alta = await obtenerPrioridadPorNombre("Alta");
    const cliente = await crearClienteTest();
    const ot = await crearOtApi(auth, cliente.id, { prioridadId: alta.id });
    const [antes] = await AppDataSource.query(`SELECT sla_resolucion_vence_en FROM ot WHERE id = @0`, [ot.id]);

    const nuevoPlan = await AppDataSource.getRepository(PlanSla).save({
      nombre: "Plan alterno",
      horasResolucion: 4,
      horasPrimeraRespuesta: 1,
    });

    const res = await request(app).patch(`/api/v1/prioridades/${alta.id}`).set("Authorization", auth).send({ planSlaId: nuevoPlan.id });
    expect(res.status).toBe(200);
    expect(res.body.data.planSlaId).toBe(nuevoPlan.id);

    const [despues] = await AppDataSource.query(`SELECT sla_resolucion_vence_en FROM ot WHERE id = @0`, [ot.id]);
    expect(despues.sla_resolucion_vence_en.getTime()).not.toBe(antes.sla_resolucion_vence_en.getTime());
  });

  it("desvincular planSlaId (null) deja sin SLA lo abierto de esa prioridad", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);
    const alta = await obtenerPrioridadPorNombre("Alta");
    const cliente = await crearClienteTest();
    const ot = await crearOtApi(auth, cliente.id, { prioridadId: alta.id });

    const res = await request(app).patch(`/api/v1/prioridades/${alta.id}`).set("Authorization", auth).send({ planSlaId: null });
    expect(res.status).toBe(200);
    expect(res.body.data.planSlaId).toBeNull();

    const [despues] = await AppDataSource.query(`SELECT sla_resolucion_vence_en FROM ot WHERE id = @0`, [ot.id]);
    expect(despues.sla_resolucion_vence_en).toBeNull();
  });
});
