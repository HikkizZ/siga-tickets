import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { comparePassword } from "../auth/password.js";
import { Rol } from "../entities/enums.js";
import { conectarBD, crearCuentaPortalTest, crearUsuarioSistemaTest, limpiarBD } from "../test/helpers.js";
import { API, crearSesionNombrada } from "../test/otHelpers.js";
import { crearTicketPublicoApi, PORTAL, tokenPortalTest } from "../test/portalHelpers.js";

beforeAll(conectarBD);
beforeEach(async () => {
  await limpiarBD();
  await crearUsuarioSistemaTest();
});
afterAll(async () => {
  await AppDataSource.destroy();
});

const registroBody = (extra: Record<string, unknown> = {}) => ({
  email: "cliente@test.local",
  password: "Password-de-test-1",
  nombre: "Cliente de Prueba",
  captchaToken: "token-de-prueba",
  ...extra,
});

function registrar(body: Record<string, unknown>) {
  return request(app).post(`${PORTAL}/cuentas/registro`).send(body);
}

function login(body: Record<string, unknown>) {
  return request(app).post(`${PORTAL}/cuentas/login`).send(body);
}

// ------------------------------------------------------------------ registro

describe("POST /publico/cuentas/registro", () => {
  it("crea la cuenta activa, hashea la contraseña, y devuelve un token (login automático)", async () => {
    const res = await registrar(registroBody());

    expect(res.status).toBe(201);
    expect(typeof res.body.data.token).toBe("string");

    const [fila] = await AppDataSource.query(`SELECT email, nombre, activo, password_hash FROM cuenta_portal WHERE email = @0`, [
      "cliente@test.local",
    ]);
    expect(fila.email).toBe("cliente@test.local");
    expect(fila.nombre).toBe("Cliente de Prueba");
    expect(fila.activo).toBe(true);
    expect(fila.password_hash).not.toBe("Password-de-test-1");
    expect(await comparePassword("Password-de-test-1", fila.password_hash)).toBe(true);
  });

  it("email ya registrado: 409 CONFLICT (a diferencia del seguimiento, acá sí se revela)", async () => {
    await registrar(registroBody());
    const res = await registrar(registroBody({ nombre: "Otra Persona" }));

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CONFLICT");

    const filas = await AppDataSource.query(`SELECT id FROM cuenta_portal WHERE email = @0`, ["cliente@test.local"]);
    expect(filas).toHaveLength(1); // no se creó una segunda fila
  });

  it("password fuera de rango (< 8 caracteres): 400 VALIDATION_ERROR", async () => {
    const res = await registrar(registroBody({ password: "corta1" }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("password fuera de rango (> 72 caracteres): 400 VALIDATION_ERROR", async () => {
    const res = await registrar(registroBody({ password: "a".repeat(73) }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("captchaToken faltante: 400", async () => {
    const { captchaToken: _omitido, ...resto } = registroBody();
    const res = await registrar(resto);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("rate limit: la ruta está protegida por un limitador (mecanismo probado aparte, ver middlewares/rateLimit.test.ts)", async () => {
    // Igual que portal.crear.test.ts: en NODE_ENV=test el limitador se salta, así que aquí solo se
    // confirma que la ruta sigue respondiendo con normalidad más allá de 5 solicitudes.
    for (let i = 0; i < 6; i++) {
      const res = await registrar(registroBody({ email: `cliente${i}@test.local` }));
      expect(res.status).toBe(201);
    }
  });
});

// ------------------------------------------------------------------ login

describe("POST /publico/cuentas/login", () => {
  it("credenciales correctas: 200 con token", async () => {
    await crearCuentaPortalTest({ email: "login@test.local", password: "Password-de-test-1" });
    const res = await login({ email: "login@test.local", password: "Password-de-test-1", captchaToken: "x" });
    expect(res.status).toBe(200);
    expect(typeof res.body.data.token).toBe("string");
  });

  it("correo inexistente: 401 INVALID_CREDENTIALS (mismo código/mensaje genérico)", async () => {
    const res = await login({ email: "no-existe@test.local", password: "loquesea123", captchaToken: "x" });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_CREDENTIALS");
  });

  it("contraseña incorrecta: 401 INVALID_CREDENTIALS (mismo código/mensaje que correo inexistente)", async () => {
    await crearCuentaPortalTest({ email: "login2@test.local", password: "Password-de-test-1" });
    const noExiste = await login({ email: "no-existe-2@test.local", password: "loquesea123", captchaToken: "x" });
    const passIncorrecta = await login({ email: "login2@test.local", password: "otra-clave-mala", captchaToken: "x" });

    expect(passIncorrecta.status).toBe(401);
    expect(passIncorrecta.body.code).toBe("INVALID_CREDENTIALS");
    expect(passIncorrecta.body.message).toBe(noExiste.body.message);
    expect(passIncorrecta.body.code).toBe(noExiste.body.code);
  });

  it("cuenta desactivada: mismo error genérico (no revela que existe pero está inactiva)", async () => {
    await crearCuentaPortalTest({ email: "inactiva@test.local", password: "Password-de-test-1", activo: false });
    const res = await login({ email: "inactiva@test.local", password: "Password-de-test-1", captchaToken: "x" });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_CREDENTIALS");
    expect(res.body.message).toBe("Credenciales inválidas");
  });

  it("rate limit: la ruta está protegida por un limitador (mecanismo probado aparte)", async () => {
    for (let i = 0; i < 6; i++) {
      const res = await login({ email: "no-existe@test.local", password: "x", captchaToken: "x" });
      expect(res.status).toBe(401); // nunca 429 en test: el limitador se salta
    }
  });
});

// ------------------------------------------------------------------ mis-tickets / detalle / mensajes

async function cuentaConSesion(email = "dueno@test.local") {
  const { cuenta, password } = await crearCuentaPortalTest({ email });
  const res = await login({ email, password, captchaToken: "x" });
  return { cuenta, auth: `Bearer ${res.body.data.token as string}` };
}

describe("GET /publico/cuentas/mis-tickets", () => {
  it("solo devuelve tickets del correo de la cuenta, nunca de otro", async () => {
    const { auth } = await cuentaConSesion("dueno@test.local");
    const propio = await crearTicketPublicoApi({ correo: "dueno@test.local", asunto: "Ticket propio" });
    await crearTicketPublicoApi({ correo: "otro@test.local", asunto: "Ticket ajeno" });

    const res = await request(app).get(`${PORTAL}/cuentas/mis-tickets`).set("Authorization", auth);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].numero).toBe(propio.numero);
    expect(res.body.data[0].asunto).toBe("Ticket propio");
    expect(Object.keys(res.body.data[0]).sort()).toEqual(["asunto", "estado", "fechaIngreso", "numero"].sort());
    expect(res.body.meta).toEqual({ page: 1, perPage: 25, total: 1 });
  });

  it("ordena por fechaIngreso DESC y pagina con los defaults habituales", async () => {
    const { auth } = await cuentaConSesion("varios@test.local");
    const t1 = await crearTicketPublicoApi({ correo: "varios@test.local", asunto: "Primero" });
    const t2 = await crearTicketPublicoApi({ correo: "varios@test.local", asunto: "Segundo" });

    const res = await request(app).get(`${PORTAL}/cuentas/mis-tickets`).set("Authorization", auth);
    expect(res.status).toBe(200);
    expect(res.body.data.map((t: { numero: string }) => t.numero)).toEqual([t2.numero, t1.numero]);
  });

  it("sin token: 401", async () => {
    const res = await request(app).get(`${PORTAL}/cuentas/mis-tickets`);
    expect(res.status).toBe(401);
  });

  it("token de portal (scope:'portal', por ticket) no sirve acá: 401", async () => {
    const { numero } = await crearTicketPublicoApi({ correo: "x@test.local" });
    const [fila] = await AppDataSource.query(`SELECT id FROM ticket WHERE numero = @0`, [numero]);
    const res = await request(app)
      .get(`${PORTAL}/cuentas/mis-tickets`)
      .set("Authorization", tokenPortalTest((fila.id as string).toLowerCase()));
    expect(res.status).toBe(401);
  });
});

describe("GET /publico/cuentas/tickets/:numero", () => {
  it("404 si el ticket no existe", async () => {
    const { auth } = await cuentaConSesion("a@test.local");
    const res = await request(app).get(`${PORTAL}/cuentas/tickets/TK-9999`).set("Authorization", auth);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("TICKET_NO_ENCONTRADO");
  });

  it("404 si el ticket es de otro correo (mismo código que 'no existe', sin distinguir)", async () => {
    const { auth } = await cuentaConSesion("dueno2@test.local");
    const ajeno = await crearTicketPublicoApi({ correo: "otro2@test.local" });

    const res = await request(app).get(`${PORTAL}/cuentas/tickets/${ajeno.numero}`).set("Authorization", auth);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("TICKET_NO_ENCONTRADO");
  });

  it("200 con la misma proyección que GET /publico/ticket cuando es suyo", async () => {
    const { auth } = await cuentaConSesion("dueno3@test.local");
    const propio = await crearTicketPublicoApi({ correo: "dueno3@test.local", asunto: "Mi ticket" });

    const res = await request(app).get(`${PORTAL}/cuentas/tickets/${propio.numero}`).set("Authorization", auth);
    expect(res.status).toBe(200);
    expect(res.body.data.numero).toBe(propio.numero);
    expect(res.body.data.asunto).toBe("Mi ticket");
    expect(Object.keys(res.body.data).sort()).toEqual(["asunto", "descripcion", "estado", "fechaIngreso", "mensajes", "numero", "ot"].sort());
  });
});

describe("POST /publico/cuentas/tickets/:numero/mensajes", () => {
  it("crea un mensaje real tipo cliente y aparece en el hilo", async () => {
    const { auth } = await cuentaConSesion("dueno4@test.local");
    const propio = await crearTicketPublicoApi({ correo: "dueno4@test.local" });

    const res = await request(app)
      .post(`${PORTAL}/cuentas/tickets/${propio.numero}/mensajes`)
      .set("Authorization", auth)
      .field("cuerpo", "Una respuesta desde mi cuenta");

    expect(res.status).toBe(201);
    const [fila] = await AppDataSource.query(
      `SELECT tipo, autor_id, autor_externo, cuerpo FROM mensaje_ticket m JOIN ticket t ON t.id = m.ticket_id WHERE t.numero = @0`,
      [propio.numero],
    );
    expect(fila.tipo).toBe("cliente");
    expect(fila.autor_id).toBeNull();
    expect(fila.autor_externo).toBe("dueno4@test.local");
    expect(fila.cuerpo).toBe("Una respuesta desde mi cuenta");

    const detalle = await request(app).get(`${PORTAL}/cuentas/tickets/${propio.numero}`).set("Authorization", auth);
    expect(detalle.body.data.mensajes.some((m: { cuerpo: string }) => m.cuerpo === "Una respuesta desde mi cuenta")).toBe(true);
  });

  it("404 si el ticket no es suyo", async () => {
    const { auth } = await cuentaConSesion("dueno5@test.local");
    const ajeno = await crearTicketPublicoApi({ correo: "otro5@test.local" });

    const res = await request(app)
      .post(`${PORTAL}/cuentas/tickets/${ajeno.numero}/mensajes`)
      .set("Authorization", auth)
      .field("cuerpo", "intento ajeno");

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("TICKET_NO_ENCONTRADO");
    const filas = await AppDataSource.query(`SELECT COUNT(*) AS total FROM mensaje_ticket`);
    expect(Number(filas[0].total)).toBe(0);
  });

  it("mismo comportamiento de reapertura que el flujo existente (esperando_cliente -> abierto)", async () => {
    const tecnico = await crearSesionNombrada(Rol.TECNICO, "tecnico_cuenta_reabre");
    const { auth } = await cuentaConSesion("dueno6@test.local");
    const propio = await crearTicketPublicoApi({ correo: "dueno6@test.local" });
    const [fila] = await AppDataSource.query(`SELECT id FROM ticket WHERE numero = @0`, [propio.numero]);
    const ticketId = (fila.id as string).toLowerCase();

    await request(app).post(`${API}/tickets/${ticketId}/tomar`).set("Authorization", tecnico.auth);
    await request(app).post(`${API}/tickets/${ticketId}/estado`).set("Authorization", tecnico.auth).send({ estado: "esperando_cliente" });

    const res = await request(app)
      .post(`${PORTAL}/cuentas/tickets/${propio.numero}/mensajes`)
      .set("Authorization", auth)
      .field("cuerpo", "ya lo revisé");
    expect(res.status).toBe(201);

    const [ticketFila] = await AppDataSource.query(`SELECT estado FROM ticket WHERE id = @0`, [ticketId]);
    expect(ticketFila.estado).toBe("abierto");
  });

  it("sin token: 401", async () => {
    const res = await request(app).post(`${PORTAL}/cuentas/tickets/TK-0001/mensajes`).field("cuerpo", "hola");
    expect(res.status).toBe(401);
  });
});

// ------------------------------------------------------------------ el flujo VIEJO sigue igual

describe("el flujo existente de número+correo sigue funcionando sin cambios (Fase D es aditiva)", () => {
  it("seguimiento + ver + responder, de punta a punta, sin ninguna cuenta de por medio", async () => {
    const { numero } = await crearTicketPublicoApi({ correo: "solovieja@test.local", asunto: "Flujo viejo" });

    const seguimiento = await request(app)
      .post(`${PORTAL}/tickets/seguimiento`)
      .send({ numero, email: "solovieja@test.local", captchaToken: "x" });
    expect(seguimiento.status).toBe(200);
    const auth = `Bearer ${seguimiento.body.data.token as string}`;

    const ver = await request(app).get(`${PORTAL}/ticket`).set("Authorization", auth);
    expect(ver.status).toBe(200);
    expect(ver.body.data.numero).toBe(numero);

    const responder = await request(app).post(`${PORTAL}/ticket/mensajes`).set("Authorization", auth).field("cuerpo", "sigo con el flujo viejo");
    expect(responder.status).toBe(201);

    // El token de portal por ticket (scope:'portal') no sirve en los endpoints de cuenta.
    const cuentaEndpoint = await request(app).get(`${PORTAL}/cuentas/mis-tickets`).set("Authorization", auth);
    expect(cuentaEndpoint.status).toBe(401);
  });

  it("seguimiento con correo equivocado: mismo 401 SEGUIMIENTO_INVALIDO de siempre, sin relación con cuentas", async () => {
    const { numero } = await crearTicketPublicoApi({ correo: "correcto@test.local" });
    const res = await request(app)
      .post(`${PORTAL}/tickets/seguimiento`)
      .send({ numero, email: "equivocado@test.local", captchaToken: "x" });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("SEGUIMIENTO_INVALIDO");
  });
});
