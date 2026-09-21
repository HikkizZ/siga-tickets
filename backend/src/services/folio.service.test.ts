import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppDataSource } from "../config/dataSource.js";
import { conectarBD, limpiarBD } from "../test/helpers.js";
import { enTransaccion, siguienteFolio, type ManagerTransaccional } from "./folio.service.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

describe("siguienteFolio", () => {
  it("arranca en cada serie según la semilla", async () => {
    const folios = await enTransaccion(AppDataSource, async (m) => [
      await siguienteFolio(m, "TK"),
      await siguienteFolio(m, "OT"),
      await siguienteFolio(m, "COT"),
    ]);

    expect(folios).toEqual(["TK-0001", "OT-1041", "COT-2041"]);
  });

  it("20 transacciones concurrentes: 20 números consecutivos, sin repetidos ni huecos", async () => {
    const folios = await Promise.all(
      Array.from({ length: 20 }, () => enTransaccion(AppDataSource, (m) => siguienteFolio(m, "TK"))),
    );

    const numeros = folios.map((f) => Number(f.slice(3))).sort((a, b) => a - b);
    expect(new Set(folios).size).toBe(20);
    expect(numeros).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it("un rollback NO deja hueco: el siguiente reutiliza el número", async () => {
    const primero = await enTransaccion(AppDataSource, (m) => siguienteFolio(m, "OT"));

    await expect(
      enTransaccion(AppDataSource, async (m) => {
        const quemado = await siguienteFolio(m, "OT");
        expect(quemado).toBe("OT-1042");
        throw new Error("falla el insert posterior");
      }),
    ).rejects.toThrow("falla el insert posterior");

    const siguiente = await enTransaccion(AppDataSource, (m) => siguienteFolio(m, "OT"));
    expect(primero).toBe("OT-1041");
    expect(siguiente).toBe("OT-1042");
  });

  it("rechaza en runtime un manager que no esté en transacción (aunque se esquive el tipo)", async () => {
    const sinTx = AppDataSource.manager as ManagerTransaccional;

    await expect(siguienteFolio(sinTx, "TK")).rejects.toThrow(/transacción/);
  });

  it("serie desconocida: falla", async () => {
    await expect(
      enTransaccion(AppDataSource, (m) => siguienteFolio(m, "XX" as "TK")),
    ).rejects.toThrow(/desconocida/);
  });
});
