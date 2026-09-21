import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { Rol } from "../entities/enums.js";
import { conectarBD, crearSesion, crearUsuarioTest, limpiarBD } from "../test/helpers.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

const nuevoUsuario = {
  username: "maria",
  nombre: "María Pérez",
  email: "Maria@Siga.cl",
  password: "Clave-inicial-1",
  rol: Rol.TECNICO,
};

describe("authorize en /usuarios: solo admin", () => {
  it("admin puede listar", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);

    const res = await request(app).get("/api/v1/usuarios").set("Authorization", auth);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it.each([Rol.GESTION, Rol.TECNICO, Rol.LECTURA])("%s recibe 403 en GET, POST y PATCH", async (rol) => {
    const { usuario, auth } = await crearSesion(rol);

    const get = await request(app).get("/api/v1/usuarios").set("Authorization", auth);
    const post = await request(app).post("/api/v1/usuarios").set("Authorization", auth).send(nuevoUsuario);
    const patch = await request(app)
      .patch(`/api/v1/usuarios/${usuario.id}`)
      .set("Authorization", auth)
      .send({ nombre: "Otro" });

    for (const res of [get, post, patch]) {
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
    }
  });

  it("sin token: 401", async () => {
    const res = await request(app).get("/api/v1/usuarios");

    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/usuarios", () => {
  it("crea el usuario: 201, email en minúsculas, must_change_password activo, sin hash en la respuesta", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);

    const res = await request(app).post("/api/v1/usuarios").set("Authorization", auth).send(nuevoUsuario);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      username: "maria",
      email: "maria@siga.cl",
      rol: Rol.TECNICO,
      activo: true,
      mustChangePassword: true,
    });
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    // y el nuevo usuario puede entrar con la contraseña inicial
    const login = await request(app).post("/api/v1/auth/login").send({ username: "maria", password: "Clave-inicial-1" });
    expect(login.status).toBe(200);
  });

  it("username duplicado: 409", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);
    await request(app).post("/api/v1/usuarios").set("Authorization", auth).send(nuevoUsuario);

    const res = await request(app)
      .post("/api/v1/usuarios")
      .set("Authorization", auth)
      .send({ ...nuevoUsuario, email: "otra@siga.cl" });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CONFLICT");
  });

  it("email duplicado (sin distinguir mayúsculas): 409", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);
    await request(app).post("/api/v1/usuarios").set("Authorization", auth).send(nuevoUsuario);

    const res = await request(app)
      .post("/api/v1/usuarios")
      .set("Authorization", auth)
      .send({ ...nuevoUsuario, username: "maria2", email: "MARIA@siga.cl" });

    expect(res.status).toBe(409);
  });

  it("rol inválido o campo desconocido: 400", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);

    const rolMalo = await request(app)
      .post("/api/v1/usuarios")
      .set("Authorization", auth)
      .send({ ...nuevoUsuario, rol: "superadmin" });
    const extra = await request(app)
      .post("/api/v1/usuarios")
      .set("Authorization", auth)
      .send({ ...nuevoUsuario, activo: false });

    expect(rolMalo.status).toBe(400);
    expect(extra.status).toBe(400);
  });

  it("no se puede crear un usuario llamado sistema", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);

    const res = await request(app)
      .post("/api/v1/usuarios")
      .set("Authorization", auth)
      .send({ ...nuevoUsuario, username: "sistema" });

    expect(res.status).toBe(409);
  });
});

describe("PATCH /api/v1/usuarios/:id", () => {
  it("soft delete: desactivar impide el login pero conserva la fila", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);
    const { usuario, password } = await crearUsuarioTest(Rol.TECNICO, { username: "pedro" });

    const res = await request(app)
      .patch(`/api/v1/usuarios/${usuario.id}`)
      .set("Authorization", auth)
      .send({ activo: false });

    expect(res.status).toBe(200);
    expect(res.body.data.activo).toBe(false);
    const login = await request(app).post("/api/v1/auth/login").send({ username: "pedro", password });
    expect(login.status).toBe(401);
    const lista = await request(app).get("/api/v1/usuarios").set("Authorization", auth);
    expect(lista.body.data.map((u: { username: string }) => u.username)).toContain("pedro");
  });

  it("cambia rol, cargo y nombre", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);
    const { usuario } = await crearUsuarioTest(Rol.LECTURA, { username: "ana" });

    const res = await request(app)
      .patch(`/api/v1/usuarios/${usuario.id}`)
      .set("Authorization", auth)
      .send({ rol: Rol.GESTION, cargo: "Jefa de proyectos", nombre: "Ana Soto" });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ rol: Rol.GESTION, cargo: "Jefa de proyectos", nombre: "Ana Soto" });
  });

  it("reseteo de contraseña por admin: la nueva sirve y obliga a cambiarla", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);
    const { usuario } = await crearUsuarioTest(Rol.TECNICO, { username: "luis" });

    const res = await request(app)
      .patch(`/api/v1/usuarios/${usuario.id}`)
      .set("Authorization", auth)
      .send({ password: "Reseteada-por-admin-1" });

    expect(res.status).toBe(200);
    expect(res.body.data.mustChangePassword).toBe(true);
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: "luis", password: "Reseteada-por-admin-1" });
    expect(login.status).toBe(200);
  });

  it("un admin no puede desactivarse ni bajarse el rol a sí mismo", async () => {
    const { usuario, auth } = await crearSesion(Rol.ADMIN);

    const desactivar = await request(app)
      .patch(`/api/v1/usuarios/${usuario.id}`)
      .set("Authorization", auth)
      .send({ activo: false });
    const bajar = await request(app)
      .patch(`/api/v1/usuarios/${usuario.id}`)
      .set("Authorization", auth)
      .send({ rol: Rol.LECTURA });

    expect(desactivar.status).toBe(409);
    expect(bajar.status).toBe(409);
  });

  it("el usuario sistema no se puede modificar (no se puede activar para loguearse)", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);
    const { usuario } = await crearUsuarioTest(Rol.LECTURA, { username: "sistema", activo: false });

    const res = await request(app)
      .patch(`/api/v1/usuarios/${usuario.id}`)
      .set("Authorization", auth)
      .send({ activo: true });

    expect(res.status).toBe(403);
  });

  it("id inexistente: 404; id mal formado: 400; body vacío: 400", async () => {
    const { auth } = await crearSesion(Rol.ADMIN);

    const noExiste = await request(app)
      .patch("/api/v1/usuarios/00000000-0000-4000-8000-000000000000")
      .set("Authorization", auth)
      .send({ nombre: "X" });
    const malId = await request(app).patch("/api/v1/usuarios/abc").set("Authorization", auth).send({ nombre: "X" });
    const vacio = await request(app)
      .patch("/api/v1/usuarios/00000000-0000-4000-8000-000000000000")
      .set("Authorization", auth)
      .send({});

    expect(noExiste.status).toBe(404);
    expect(malId.status).toBe(400);
    expect(vacio.status).toBe(400);
  });
});
