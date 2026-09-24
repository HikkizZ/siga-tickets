import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { Rol } from "../entities/enums.js";
import { conectarBD, crearSesion, limpiarBD, obtenerCanalTicketPorNombre } from "../test/helpers.js";
import { API, crearSesionNombrada } from "../test/otHelpers.js";
import { ticketBody } from "../test/ticketHelpers.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

// La URL usa "fuentes-ticket" (ver docs/api.md); el nombre en código sigue siendo canal.
describe("GET /api/v1/fuentes-ticket: rol lectura o superior", () => {
  it.each([Rol.LECTURA, Rol.TECNICO, Rol.GESTION, Rol.ADMIN])("%s puede listar (con la semilla de 5 canales)", async (rol) => {
    const { auth } = await crearSesion(rol);

    const res = await request(app).get("/api/v1/fuentes-ticket").set("Authorization", auth);

    expect(res.status).toBe(200);
    expect(res.body.data.map((c: { nombre: string }) => c.nombre)).toEqual(["Portal", "Correo", "Teléfono", "Presencial", "Interno"]);
    expect(res.body.data[0]).toEqual({
      id: expect.any(String),
      nombre: "Portal",
      orden: 1,
      activo: true,
      esManual: false,
      origenOtEquivalente: "mesa_ayuda",
    });
  });

  it("sin token: 401", async () => {
    const res = await request(app).get("/api/v1/fuentes-ticket");
    expect(res.status).toBe(401);
  });
});

describe("escritura de fuentes de ticket: solo admin", () => {
  it.each([Rol.LECTURA, Rol.TECNICO, Rol.GESTION])("%s recibe 403 en POST y PATCH", async (rol) => {
    const { auth } = await crearSesion(rol);
    const portal = await obtenerCanalTicketPorNombre("Portal");

    const post = await request(app)
      .post("/api/v1/fuentes-ticket")
      .set("Authorization", auth)
      .send({ nombre: "Chat", esManual: true, origenOtEquivalente: "mesa_ayuda" });
    const patch = await request(app).patch(`/api/v1/fuentes-ticket/${portal.id}`).set("Authorization", auth).send({ activo: false });

    expect(post.status).toBe(403);
    expect(patch.status).toBe(403);
  });

  it("admin crea un canal manual con su origen de OT equivalente", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);

    const res = await request(app)
      .post("/api/v1/fuentes-ticket")
      .set("Authorization", auth)
      .send({ nombre: "Chat", orden: 6, esManual: true, origenOtEquivalente: "mesa_ayuda" });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      id: expect.any(String),
      nombre: "Chat",
      orden: 6,
      activo: true,
      esManual: true,
      origenOtEquivalente: "mesa_ayuda",
    });
  });

  it("origenOtEquivalente inválido: 400", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);

    const res = await request(app)
      .post("/api/v1/fuentes-ticket")
      .set("Authorization", auth)
      .send({ nombre: "Chat", origenOtEquivalente: "no_existe" });

    expect(res.status).toBe(400);
  });

  it("nombre duplicado: 409 CONFLICT", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);

    const res = await request(app)
      .post("/api/v1/fuentes-ticket")
      .set("Authorization", auth)
      .send({ nombre: "Portal", origenOtEquivalente: "mesa_ayuda" });

    expect(res.status).toBe(409);
  });

  it("PATCH a un canal inexistente: 404", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);

    const res = await request(app)
      .patch("/api/v1/fuentes-ticket/00000000-0000-4000-8000-000000000000")
      .set("Authorization", auth)
      .send({ activo: false });

    expect(res.status).toBe(404);
  });

  it("esManual=false: POST /tickets rechaza ese canal (reservado a su propio flujo)", async () => {
    const tecnico = await crearSesionNombrada(Rol.TECNICO, "tecnico_fuente_manual");
    const portal = await obtenerCanalTicketPorNombre("Portal");

    const res = await request(app)
      .post(`${API}/tickets`)
      .set("Authorization", tecnico.auth)
      .send(await ticketBody({ canalId: portal.id }));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("CANAL_INVALIDO");
  });

  it("marcar esManual=true por PATCH permite usar ese canal en POST /tickets", async () => {
    const { auth: adminAuth } = await crearSesion(Rol.ADMIN);
    const tecnico = await crearSesionNombrada(Rol.TECNICO, "tecnico_fuente_manual2");
    const portal = await obtenerCanalTicketPorNombre("Portal");

    const patch = await request(app).patch(`/api/v1/fuentes-ticket/${portal.id}`).set("Authorization", adminAuth).send({ esManual: true });
    expect(patch.status).toBe(200);

    const res = await request(app)
      .post(`${API}/tickets`)
      .set("Authorization", tecnico.auth)
      .send(await ticketBody({ canalId: portal.id }));

    expect(res.status).toBe(201);
  });
});
