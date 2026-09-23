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

describe("GET /correo/config", () => {
  it("rol lectura puede ver la config, sin fila todavía devuelve estado vacío", async () => {
    const lectura = await crearSesionNombrada(Rol.LECTURA, "lectura_correo_cfg");
    const res = await request(app).get(`${API}/correo/config`).set("Authorization", lectura.auth);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ imapHabilitado: false, smtpHabilitado: false, tieneImapPassword: false, tieneSmtpPassword: false });
  });

  it("nunca devuelve la contraseña, ni cifrada ni plana, solo el booleano tieneImapPassword/tieneSmtpPassword", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_correo_cfg_get");
    await request(app)
      .put(`${API}/correo/config`)
      .set("Authorization", admin.auth)
      .send({ imapPassword: "clave-secreta-imap", smtpPassword: "clave-secreta-smtp" });

    const res = await request(app).get(`${API}/correo/config`).set("Authorization", admin.auth);

    expect(res.status).toBe(200);
    const cuerpo = JSON.stringify(res.body);
    expect(cuerpo).not.toContain("clave-secreta-imap");
    expect(cuerpo).not.toContain("clave-secreta-smtp");
    expect(res.body.data).not.toHaveProperty("imapPassword");
    expect(res.body.data).not.toHaveProperty("imapPasswordCifrado");
    expect(res.body.data).not.toHaveProperty("smtpPassword");
    expect(res.body.data).not.toHaveProperty("smtpPasswordCifrado");
    expect(res.body.data.tieneImapPassword).toBe(true);
    expect(res.body.data.tieneSmtpPassword).toBe(true);
  });
});

describe("PUT /correo/config", () => {
  it("RBAC: lectura y tecnico no pueden editar, gestion tampoco, solo admin", async () => {
    const lectura = await crearSesionNombrada(Rol.LECTURA, "lectura_correo_cfg_rbac");
    const tecnico = await crearSesionNombrada(Rol.TECNICO, "tecnico_correo_cfg_rbac");
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_correo_cfg_rbac");
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_correo_cfg_rbac");
    const body = { imapHost: "imap.ejemplo.cl" };

    const rLectura = await request(app).put(`${API}/correo/config`).set("Authorization", lectura.auth).send(body);
    const rTecnico = await request(app).put(`${API}/correo/config`).set("Authorization", tecnico.auth).send(body);
    const rGestion = await request(app).put(`${API}/correo/config`).set("Authorization", gestion.auth).send(body);
    const rAdmin = await request(app).put(`${API}/correo/config`).set("Authorization", admin.auth).send(body);

    expect(rLectura.status).toBe(403);
    expect(rTecnico.status).toBe(403);
    expect(rGestion.status).toBe(403);
    expect(rAdmin.status).toBe(200);
  });

  it("body parcial: solo cambia lo enviado, nunca acepta una contraseña ya cifrada desde afuera (strict)", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_correo_cfg_parcial");

    const primero = await request(app)
      .put(`${API}/correo/config`)
      .set("Authorization", admin.auth)
      .send({ imapHost: "imap.viejo.cl", imapPassword: "clave-original", smtpHost: "smtp.viejo.cl" });
    expect(primero.status).toBe(200);

    const segundo = await request(app).put(`${API}/correo/config`).set("Authorization", admin.auth).send({ imapHost: "imap.nuevo.cl" });
    expect(segundo.status).toBe(200);
    expect(segundo.body.data.imapHost).toBe("imap.nuevo.cl");
    expect(segundo.body.data.smtpHost).toBe("smtp.viejo.cl");
    expect(segundo.body.data.tieneImapPassword).toBe(true); // la contraseña original no se perdió

    // "imapPasswordCifrado" no es un campo aceptado por el schema (.strict()): un intento de mandar
    // algo ya cifrado desde afuera se rechaza como dato desconocido, no se guarda como si fuera texto plano.
    const intentoInvalido = await request(app)
      .put(`${API}/correo/config`)
      .set("Authorization", admin.auth)
      .send({ imapPasswordCifrado: "algo:que:no:deberia:aceptarse" });
    expect(intentoInvalido.status).toBe(400);
  });

  it("valida tipos básicos: puerto fuera de rango -> 400", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_correo_cfg_val");
    const res = await request(app).put(`${API}/correo/config`).set("Authorization", admin.auth).send({ smtpPort: 99999 });
    expect(res.status).toBe(400);
  });
});
