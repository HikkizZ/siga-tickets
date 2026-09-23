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

const planBody = (extra: Record<string, unknown> = {}) => ({
  nombre: "Premium 4h",
  horasResolucion: 4,
  horasPrimeraRespuesta: 1,
  ...extra,
});

describe("GET/POST/PATCH/DELETE /sla/planes (Fase B2)", () => {
  it("crea un plan, lo lista, lo edita parcialmente y lo borra", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_planes");

    const crear = await request(app).post(`${API}/sla/planes`).set("Authorization", admin.auth).send(planBody());
    expect(crear.status).toBe(201);
    expect(crear.body.data).toMatchObject({
      nombre: "Premium 4h",
      activo: true,
      horasResolucion: 4,
      horasPrimeraRespuesta: 1,
      usarHorasHabiles: true,
      pausarEnEsperaCliente: true,
      umbralPorVencer: 0.2,
    });
    const id = crear.body.data.id as string;

    const lista = await request(app).get(`${API}/sla/planes`).set("Authorization", admin.auth);
    expect(lista.status).toBe(200);
    expect(lista.body.data).toHaveLength(1);
    expect(lista.body.data[0].nombre).toBe("Premium 4h");

    const editar = await request(app)
      .patch(`${API}/sla/planes/${id}`)
      .set("Authorization", admin.auth)
      .send({ activo: false, horasResolucion: 8 });
    expect(editar.status).toBe(200);
    expect(editar.body.data).toMatchObject({ activo: false, horasResolucion: 8, horasPrimeraRespuesta: 1 });

    const borrar = await request(app).delete(`${API}/sla/planes/${id}`).set("Authorization", admin.auth);
    expect(borrar.status).toBe(200);
    expect(borrar.body.data).toBeNull();

    const listaFinal = await request(app).get(`${API}/sla/planes`).set("Authorization", admin.auth);
    expect(listaFinal.body.data).toHaveLength(0);
  });

  it("nombre duplicado: 409 CONFLICT", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_planes_dup");
    await request(app).post(`${API}/sla/planes`).set("Authorization", admin.auth).send(planBody());

    const res = await request(app).post(`${API}/sla/planes`).set("Authorization", admin.auth).send(planBody({ horasResolucion: 10 }));

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CONFLICT");
  });

  it("PATCH/DELETE sobre un id inexistente: 404 NOT_FOUND", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_planes_404");

    const patch = await request(app)
      .patch(`${API}/sla/planes/00000000-0000-0000-0000-000000000099`)
      .set("Authorization", admin.auth)
      .send({ activo: false });
    expect(patch.status).toBe(404);
    expect(patch.body.code).toBe("NOT_FOUND");

    const del = await request(app).delete(`${API}/sla/planes/00000000-0000-0000-0000-000000000099`).set("Authorization", admin.auth);
    expect(del.status).toBe(404);
    expect(del.body.code).toBe("NOT_FOUND");
  });

  it("RBAC: lectura ve, tecnico/gestion no escriben, solo admin crea/edita/borra", async () => {
    const lectura = await crearSesionNombrada(Rol.LECTURA, "lectura_planes");
    const tecnico = await crearSesionNombrada(Rol.TECNICO, "tecnico_planes");
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_planes");
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_planes_rbac");

    const get = await request(app).get(`${API}/sla/planes`).set("Authorization", lectura.auth);
    expect(get.status).toBe(200);

    for (const sesion of [lectura, tecnico, gestion]) {
      const post = await request(app).post(`${API}/sla/planes`).set("Authorization", sesion.auth).send(planBody());
      expect(post.status).toBe(403);
    }

    const postAdmin = await request(app).post(`${API}/sla/planes`).set("Authorization", admin.auth).send(planBody());
    expect(postAdmin.status).toBe(201);
    const id = postAdmin.body.data.id as string;

    const patchGestion = await request(app).patch(`${API}/sla/planes/${id}`).set("Authorization", gestion.auth).send({ activo: false });
    expect(patchGestion.status).toBe(403);

    const delGestion = await request(app).delete(`${API}/sla/planes/${id}`).set("Authorization", gestion.auth);
    expect(delGestion.status).toBe(403);
  });

  it("body vacío en PATCH: 400 VALIDATION_ERROR", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_planes_vacio");
    const crear = await request(app).post(`${API}/sla/planes`).set("Authorization", admin.auth).send(planBody());
    const id = crear.body.data.id as string;

    const res = await request(app).patch(`${API}/sla/planes/${id}`).set("Authorization", admin.auth).send({});
    expect(res.status).toBe(400);
  });
});
