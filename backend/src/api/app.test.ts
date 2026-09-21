import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppDataSource } from "../config/dataSource.js";
import { conectarBD } from "../test/helpers.js";
import { app } from "./app.js";

beforeAll(conectarBD);
afterAll(() => AppDataSource.destroy());

describe("GET /health", () => {
  it("responde ok y verifica la conexión a la BD", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", data: { db: "ok" } });
  });

  it("devuelve un X-Request-Id", async () => {
    const res = await request(app).get("/health");

    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("errores", () => {
  it("ruta inexistente: 404 con el formato de error", async () => {
    const res = await request(app).get("/no-existe");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ status: "error", code: "NOT_FOUND" });
  });

  it("JSON mal formado: 400 y no 500", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("Content-Type", "application/json")
      .send("{esto no es json");

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_JSON");
  });
});
