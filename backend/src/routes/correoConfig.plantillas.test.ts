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

describe("GET/PUT /correo/plantillas (Fase B2)", () => {
  it("GET sin ninguna personalización devuelve las 3, con personalizada:false y el texto fijo", async () => {
    const lectura = await crearSesionNombrada(Rol.LECTURA, "lectura_plantillas");

    const res = await request(app).get(`${API}/correo/plantillas`).set("Authorization", lectura.auth);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    const nombres = res.body.data.map((p: { nombre: string }) => p.nombre).sort();
    expect(nombres).toEqual(["aviso_soporte", "respuesta_cliente", "ticket_creado"]);
    for (const p of res.body.data) {
      expect(p.personalizada).toBe(false);
      expect(p.actualizadoEn).toBeNull();
      expect(typeof p.asunto).toBe("string");
      expect(typeof p.cuerpoHtml).toBe("string");
    }
  });

  it("PUT crea la personalización (upsert) y el GET posterior la refleja con personalizada:true", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_plantillas");

    const put = await request(app)
      .put(`${API}/correo/plantillas/respuesta_cliente`)
      .set("Authorization", admin.auth)
      .send({ asunto: "[{{numero}}] Respuesta", cuerpoHtml: "<p>{{cuerpo}}</p>" });
    expect(put.status).toBe(200);
    expect(put.body.data).toMatchObject({ nombre: "respuesta_cliente", personalizada: true, activa: true });

    const get = await request(app).get(`${API}/correo/plantillas`).set("Authorization", admin.auth);
    const fila = get.body.data.find((p: { nombre: string }) => p.nombre === "respuesta_cliente");
    expect(fila).toMatchObject({ personalizada: true, asunto: "[{{numero}}] Respuesta", cuerpoHtml: "<p>{{cuerpo}}</p>" });
    expect(fila.actualizadoEn).not.toBeNull();

    // Las otras dos siguen sin personalizar.
    const otras = get.body.data.filter((p: { nombre: string }) => p.nombre !== "respuesta_cliente");
    for (const p of otras) expect(p.personalizada).toBe(false);
  });

  it("un segundo PUT sobre la misma plantilla actualiza la fila existente (no crea una segunda)", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_plantillas_upsert");
    await request(app)
      .put(`${API}/correo/plantillas/ticket_creado`)
      .set("Authorization", admin.auth)
      .send({ asunto: "V1", cuerpoHtml: "<p>v1</p>" });

    await request(app)
      .put(`${API}/correo/plantillas/ticket_creado`)
      .set("Authorization", admin.auth)
      .send({ asunto: "V2", cuerpoHtml: "<p>v2</p>", activa: false });

    const filas: Array<{ nombre: string }> = await AppDataSource.query(`SELECT nombre FROM plantilla_correo WHERE nombre = 'ticket_creado'`);
    expect(filas).toHaveLength(1);

    const get = await request(app).get(`${API}/correo/plantillas`).set("Authorization", admin.auth);
    const fila = get.body.data.find((p: { nombre: string }) => p.nombre === "ticket_creado");
    expect(fila.asunto).toBe("V2");
    expect(fila.activa).toBe(false);
  });

  it("nombre inválido en la URL: 400 VALIDATION_ERROR", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_plantillas_invalido");
    const res = await request(app)
      .put(`${API}/correo/plantillas/no_existe`)
      .set("Authorization", admin.auth)
      .send({ asunto: "x", cuerpoHtml: "y" });
    expect(res.status).toBe(400);
  });

  it("RBAC: lectura ve, tecnico/gestion no editan, solo admin", async () => {
    const lectura = await crearSesionNombrada(Rol.LECTURA, "lectura_plantillas_rbac");
    const tecnico = await crearSesionNombrada(Rol.TECNICO, "tecnico_plantillas_rbac");
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_plantillas_rbac");
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_plantillas_rbac");

    const get = await request(app).get(`${API}/correo/plantillas`).set("Authorization", lectura.auth);
    expect(get.status).toBe(200);

    for (const sesion of [lectura, tecnico, gestion]) {
      const put = await request(app)
        .put(`${API}/correo/plantillas/aviso_soporte`)
        .set("Authorization", sesion.auth)
        .send({ asunto: "x", cuerpoHtml: "y" });
      expect(put.status).toBe(403);
    }

    const putAdmin = await request(app)
      .put(`${API}/correo/plantillas/aviso_soporte`)
      .set("Authorization", admin.auth)
      .send({ asunto: "x", cuerpoHtml: "y" });
    expect(putAdmin.status).toBe(200);
  });
});
