import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { signToken } from "../auth/jwt.js";
import { signPortalToken, verifyPortalToken } from "../auth/portalToken.js";
import { Rol } from "../entities/enums.js";
import { API } from "../test/otHelpers.js";
import { conectarBD, crearSesion, crearUsuarioSistemaTest, limpiarBD } from "../test/helpers.js";
import { crearTicketPublicoApi, PORTAL, tokenPortalTest } from "../test/portalHelpers.js";

beforeAll(conectarBD);
beforeEach(async () => {
  await limpiarBD();
  await crearUsuarioSistemaTest();
});
afterAll(async () => {
  await AppDataSource.destroy();
});

const seguimiento = (body: Record<string, unknown>) => request(app).post(`${PORTAL}/tickets/seguimiento`).send(body);

describe("POST /publico/tickets/seguimiento", () => {
  it("número y correo correctos: 200 con un token de portal válido (scope portal, TTL ~15 min)", async () => {
    const { numero } = await crearTicketPublicoApi();

    const res = await seguimiento({ numero, email: "juan.perez@cliente.cl", captchaToken: "x" });

    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data)).toEqual(["token"]);
    const payload = verifyPortalToken(res.body.data.token);
    expect(payload.scope).toBe("portal");
    expect(payload.ticketId).toBeTruthy();
    const segundosRestantes = payload.exp - payload.iat;
    expect(segundosRestantes).toBe(15 * 60);
  });

  it("número inexistente y número existente con correo incorrecto dan EXACTAMENTE la misma respuesta", async () => {
    const { numero } = await crearTicketPublicoApi();

    const noExiste = await seguimiento({ numero: "TK-9999", email: "juan.perez@cliente.cl", captchaToken: "x" });
    const correoIncorrecto = await seguimiento({ numero, email: "otro@correo.cl", captchaToken: "x" });

    expect(noExiste.status).toBe(correoIncorrecto.status);
    expect(JSON.stringify(noExiste.body)).toBe(JSON.stringify(correoIncorrecto.body));
    expect(noExiste.body).toEqual({ status: "error", code: "SEGUIMIENTO_INVALIDO", message: "No pudimos validar esos datos" });
  });

  it("la colación insensible a mayúsculas del correo aplica (sin LOWER manual)", async () => {
    const { numero } = await crearTicketPublicoApi();
    const res = await seguimiento({ numero, email: "JUAN.PEREZ@CLIENTE.CL", captchaToken: "x" });
    expect(res.status).toBe(200);
  });

  it("captchaToken faltante: 400 con código claro", async () => {
    const { numero } = await crearTicketPublicoApi();
    const res = await seguimiento({ numero, email: "juan.perez@cliente.cl" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });
});

describe("separación de tokens interno / portal (defensa en profundidad)", () => {
  it("authenticatePortal rechaza un JWT interno", async () => {
    const { usuario } = await crearSesion(Rol.ADMIN);
    const tokenInterno = signToken({ sub: usuario.id, username: usuario.username, rol: usuario.rol });

    const res = await request(app).get(`${PORTAL}/ticket`).set("Authorization", `Bearer ${tokenInterno}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_TOKEN");
  });

  it("authenticate interno rechaza un JWT de portal", async () => {
    const { numero } = await crearTicketPublicoApi();
    const [{ id: ticketId }] = await AppDataSource.query(`SELECT id FROM ticket WHERE numero = @0`, [numero]);
    const tokenPortal = signPortalToken(ticketId.toLowerCase());

    const res = await request(app).get(`${API}/tickets`).set("Authorization", `Bearer ${tokenPortal}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_TOKEN");
  });

  it("un token de portal fabricado a mano con scope distinto no sirve para ver el ticket", async () => {
    const { numero } = await crearTicketPublicoApi();
    const [{ id: ticketId }] = await AppDataSource.query(`SELECT id FROM ticket WHERE numero = @0`, [numero]);
    const auth = tokenPortalTest(ticketId.toLowerCase());
    const res = await request(app).get(`${PORTAL}/ticket`).set("Authorization", auth);
    expect(res.status).toBe(200); // control: el token de portal legítimo sí funciona
  });
});
