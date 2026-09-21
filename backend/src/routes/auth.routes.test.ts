import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { verifyToken } from "../auth/jwt.js";
import { AppDataSource } from "../config/dataSource.js";
import { Usuario } from "../entities/Usuario.js";
import { Rol } from "../entities/enums.js";
import { conectarBD, crearSesion, crearUsuarioTest, limpiarBD } from "../test/helpers.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

const login = (username: string, password: string) =>
  request(app).post("/api/v1/auth/login").send({ username, password });

describe("POST /api/v1/auth/login", () => {
  it("credenciales correctas: devuelve token y usuario sin hash", async () => {
    const { usuario, password } = await crearUsuarioTest(Rol.TECNICO);

    const res = await login(usuario.username, password);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(res.body.data.user).toMatchObject({ id: usuario.id, username: usuario.username, rol: Rol.TECNICO });
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    expect(JSON.stringify(res.body)).not.toContain("$2b$");
  });

  it("contraseña incorrecta: 401", async () => {
    const { usuario } = await crearUsuarioTest(Rol.TECNICO);

    const res = await login(usuario.username, "otra-clave-cualquiera");

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ status: "error", code: "INVALID_CREDENTIALS" });
  });

  it("usuario inexistente: mismo 401 y mismo mensaje que contraseña incorrecta", async () => {
    const { usuario } = await crearUsuarioTest(Rol.TECNICO);
    const mala = await login(usuario.username, "otra-clave-cualquiera");

    const res = await login("no-existe", "Password-de-test-1");

    expect(res.status).toBe(401);
    expect(res.body).toEqual(mala.body);
  });

  it("usuario inactivo no puede iniciar sesión aunque la contraseña sea correcta", async () => {
    const { usuario, password } = await crearUsuarioTest(Rol.TECNICO, { activo: false });

    const res = await login(usuario.username, password);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_CREDENTIALS");
  });

  it("el usuario sistema jamás inicia sesión, ni siquiera activo y con contraseña correcta", async () => {
    const { password } = await crearUsuarioTest(Rol.LECTURA, { username: "sistema", activo: true });

    const res = await login("sistema", password);

    expect(res.status).toBe(401);
  });

  it("body inválido: 400 con detalle por campo", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ campo: "body.username" })]),
    );
  });
});

describe("GET /api/v1/auth/me", () => {
  it("devuelve el perfil del usuario autenticado", async () => {
    const { usuario, auth } = await crearSesion(Rol.GESTION);

    const res = await request(app).get("/api/v1/auth/me").set("Authorization", auth);

    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({
      id: usuario.id,
      username: usuario.username,
      rol: Rol.GESTION,
      mustChangePassword: false,
    });
  });

  it("sin token: 401", async () => {
    const res = await request(app).get("/api/v1/auth/me");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHENTICATED");
  });

  it("token basura: 401", async () => {
    const res = await request(app).get("/api/v1/auth/me").set("Authorization", "Bearer abc.def.ghi");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_TOKEN");
  });

  it("un token vigente deja de servir cuando el usuario se desactiva", async () => {
    const { usuario, auth } = await crearSesion(Rol.TECNICO);
    await AppDataSource.getRepository(Usuario).update({ id: usuario.id }, { activo: false });

    const res = await request(app).get("/api/v1/auth/me").set("Authorization", auth);

    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/auth/password", () => {
  it("cambia la contraseña: la nueva sirve, la vieja no, y se apaga must_change_password", async () => {
    const { usuario, password } = await crearUsuarioTest(Rol.TECNICO, { mustChangePassword: true });
    const sesion = await login(usuario.username, password);
    const auth = `Bearer ${sesion.body.data.token}`;

    const res = await request(app)
      .post("/api/v1/auth/password")
      .set("Authorization", auth)
      .send({ currentPassword: password, newPassword: "Clave-nueva-segura-2" });

    expect(res.status).toBe(200);
    expect((await login(usuario.username, "Clave-nueva-segura-2")).status).toBe(200);
    expect((await login(usuario.username, password)).status).toBe(401);
    const me = await request(app).get("/api/v1/auth/me").set("Authorization", auth);
    expect(me.body.data.user.mustChangePassword).toBe(false);
  });

  it("contraseña actual incorrecta: 403 (no 401, para no botar la sesión en el frontend)", async () => {
    const { auth } = await crearSesion(Rol.TECNICO);

    const res = await request(app)
      .post("/api/v1/auth/password")
      .set("Authorization", auth)
      .send({ currentPassword: "no-es-esta", newPassword: "Clave-nueva-segura-2" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("WRONG_PASSWORD");
  });

  it("nueva contraseña demasiado corta: 400", async () => {
    const { auth } = await crearSesion(Rol.TECNICO);

    const res = await request(app)
      .post("/api/v1/auth/password")
      .set("Authorization", auth)
      .send({ currentPassword: "Password-de-test-1", newPassword: "corta" });

    expect(res.status).toBe(400);
  });

  it("sin token: 401", async () => {
    const res = await request(app)
      .post("/api/v1/auth/password")
      .send({ currentPassword: "x", newPassword: "Clave-nueva-segura-2" });

    expect(res.status).toBe(401);
  });
});

// SQL Server devuelve los uniqueidentifier en MAYÚSCULAS; la forma canónica del proyecto es minúscula.
describe("formato del uuid a lo largo del login", () => {
  it("id del usuario, `sub` del JWT y /auth/me coinciden y están en minúsculas", async () => {
    const { usuario, password } = await crearUsuarioTest(Rol.TECNICO);

    const res = await login(usuario.username, password);
    const sub = verifyToken(res.body.data.token).sub;
    const me = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${res.body.data.token}`);

    expect(usuario.id).toBe(usuario.id.toLowerCase());
    expect(res.body.data.user.id).toBe(usuario.id);
    expect(sub).toBe(usuario.id);
    expect(me.body.data.user.id).toBe(usuario.id);
  });
});
