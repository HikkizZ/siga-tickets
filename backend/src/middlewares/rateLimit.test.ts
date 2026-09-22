import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { limitarPorCampoBody, limitarPorIp } from "./rateLimit.js";

// Las rutas reales de /publico dejan skipEnTest en su valor por defecto (true): igual que
// loginRateLimiter, se saltan en NODE_ENV=test para no contaminar al resto de la suite (comparte
// un solo proceso/app durante toda la corrida). Aquí se prueba el MECANISMO en sí, con
// skipEnTest:false sobre una app aislada (su propio MemoryStore, no el de ninguna ruta real), con
// los mismos números que usa routes/portal.routes.ts.

function appConLimitador(mw: express.RequestHandler) {
  const a = express();
  a.use(express.json());
  a.post("/x", mw, (_req, res) => res.json({ ok: true }));
  return a;
}

describe("limitarPorIp", () => {
  it("dentro del límite responde normal; al superarlo devuelve 429 RATE_LIMITED", async () => {
    const a = appConLimitador(limitarPorIp({ windowMs: 60 * 60 * 1000, limit: 5, skipEnTest: false }));

    for (let i = 0; i < 5; i++) {
      const res = await request(a).post("/x");
      expect(res.status, `intento ${i + 1}`).toBe(200);
    }
    const sexto = await request(a).post("/x");
    expect(sexto.status).toBe(429);
    expect(sexto.body.code).toBe("RATE_LIMITED");
  });

  it("codigo personalizado se respeta", async () => {
    const a = appConLimitador(limitarPorIp({ windowMs: 60 * 60 * 1000, limit: 1, codigo: "OTRO_CODIGO", skipEnTest: false }));
    await request(a).post("/x");
    const res = await request(a).post("/x");
    expect(res.status).toBe(429);
    expect(res.body.code).toBe("OTRO_CODIGO");
  });
});

describe("limitarPorCampoBody", () => {
  it("limita por el valor de un campo del body, normalizado a minúsculas, independiente de la IP", async () => {
    const a = appConLimitador(limitarPorCampoBody("email", { windowMs: 24 * 60 * 60 * 1000, limit: 2, skipEnTest: false }));

    const uno = await request(a).post("/x").send({ email: "Cliente@Test.cl" });
    const dos = await request(a).post("/x").send({ email: "cliente@test.cl" }); // mismo correo, otra capitalización
    const tres = await request(a).post("/x").send({ email: "cliente@test.cl" });
    const otroCorreo = await request(a).post("/x").send({ email: "otro@test.cl" }); // correo distinto: contador aparte

    expect(uno.status).toBe(200);
    expect(dos.status).toBe(200);
    expect(tres.status).toBe(429); // tercera vez con el "mismo" correo dentro de la ventana
    expect(otroCorreo.status).toBe(200);
  });
});
