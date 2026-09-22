import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { Rol } from "../entities/enums.js";
import { conectarBD, limpiarBD } from "../test/helpers.js";
import { API, crearSesionNombrada } from "../test/otHelpers.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

describe("GET/POST/DELETE /sla/feriados", () => {
  it("crea un feriado, lo lista ordenado por fecha, y lo borra", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_feriados");

    const c1 = await request(app)
      .post(`${API}/sla/feriados`)
      .set("Authorization", admin.auth)
      .send({ fecha: "2026-12-25", nombre: "Navidad" });
    expect(c1.status).toBe(201);
    expect(c1.body.data).toMatchObject({ fecha: "2026-12-25", nombre: "Navidad", irrenunciable: false });

    const c2 = await request(app)
      .post(`${API}/sla/feriados`)
      .set("Authorization", admin.auth)
      .send({ fecha: "2026-05-01", nombre: "Día del Trabajo", irrenunciable: true });
    expect(c2.status).toBe(201);

    const lista = await request(app).get(`${API}/sla/feriados`).set("Authorization", admin.auth);
    expect(lista.status).toBe(200);
    expect(lista.body.data.map((f: { fecha: string }) => f.fecha)).toEqual(["2026-05-01", "2026-12-25"]);

    const del = await request(app).delete(`${API}/sla/feriados/2026-05-01`).set("Authorization", admin.auth);
    expect(del.status).toBe(200);
    const listaDespues = await request(app).get(`${API}/sla/feriados`).set("Authorization", admin.auth);
    expect(listaDespues.body.data).toHaveLength(1);
  });

  it("fecha duplicada: 409 FERIADO_YA_EXISTE", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_feriados_dup");
    await request(app).post(`${API}/sla/feriados`).set("Authorization", admin.auth).send({ fecha: "2026-09-18", nombre: "Fiestas Patrias" });

    const res = await request(app).post(`${API}/sla/feriados`).set("Authorization", admin.auth).send({ fecha: "2026-09-18", nombre: "Otro nombre" });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("FERIADO_YA_EXISTE");
  });

  it("borrar una fecha inexistente: 404 FERIADO_NO_ENCONTRADO", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_feriados_404");
    const res = await request(app).delete(`${API}/sla/feriados/2099-01-01`).set("Authorization", admin.auth);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("FERIADO_NO_ENCONTRADO");
  });

  it("RBAC: lectura ve, pero no crea ni borra; escritura exige admin", async () => {
    const lectura = await crearSesionNombrada(Rol.LECTURA, "lectura_feriados");
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_feriados");
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_feriados_rbac");

    const get = await request(app).get(`${API}/sla/feriados`).set("Authorization", lectura.auth);
    expect(get.status).toBe(200);

    const postLectura = await request(app).post(`${API}/sla/feriados`).set("Authorization", lectura.auth).send({ fecha: "2026-01-01", nombre: "x" });
    expect(postLectura.status).toBe(403);

    const postGestion = await request(app).post(`${API}/sla/feriados`).set("Authorization", gestion.auth).send({ fecha: "2026-01-01", nombre: "x" });
    expect(postGestion.status).toBe(403);

    const postAdmin = await request(app).post(`${API}/sla/feriados`).set("Authorization", admin.auth).send({ fecha: "2026-01-01", nombre: "Año Nuevo" });
    expect(postAdmin.status).toBe(201);

    const delGestion = await request(app).delete(`${API}/sla/feriados/2026-01-01`).set("Authorization", gestion.auth);
    expect(delGestion.status).toBe(403);
  });
});
