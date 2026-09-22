import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { Rol } from "../entities/enums.js";
import { conectarBD, limpiarBD } from "../test/helpers.js";
import { API, cotizacionBody, crearClienteTest, crearOtApi, crearSesionNombrada } from "../test/otHelpers.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

const post = (auth: string, url: string, body: object) => request(app).post(`${API}${url}`).set("Authorization", auth).send(body);
const get = (auth: string, url: string) => request(app).get(`${API}${url}`).set("Authorization", auth);
const vincular = (auth: string, otId: string, cotizacionId: string) => post(auth, `/ots/${otId}/cotizaciones/vincular`, { cotizacionId });

async function principales(otId: string) {
  return (await AppDataSource.query(`SELECT id, es_principal FROM cotizacion WHERE ot_id = @0`, [otId])) as Array<{
    id: string;
    es_principal: boolean;
  }>;
}

describe("POST /ots/:id/cotizaciones/vincular", () => {
  it("vincula una cotización sin OT: le asigna otId y recalcula version = MAX+1", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
    const cliente = await crearClienteTest();
    const ot = await crearOtApi(gestion.auth, cliente.id);
    await post(gestion.auth, "/cotizaciones", cotizacionBody({ otId: ot.id })); // version 1 ya existente
    const suelta = await post(gestion.auth, "/cotizaciones", cotizacionBody({ clienteId: cliente.id }));

    const res = await vincular(gestion.auth, ot.id, suelta.body.data.id);

    expect(res.status).toBe(200);
    const cotizaciones = res.body.data.cotizaciones;
    const vinculada = cotizaciones.find((c: { id: string }) => c.id === suelta.body.data.id);
    expect(vinculada.version).toBe(2);
  });

  it("evento cotizacion_vinculada en la OT", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
    const cliente = await crearClienteTest();
    const ot = await crearOtApi(gestion.auth, cliente.id);
    const suelta = await post(gestion.auth, "/cotizaciones", cotizacionBody({ clienteId: cliente.id }));

    await vincular(gestion.auth, ot.id, suelta.body.data.id);

    const eventos = await AppDataSource.query(`SELECT tipo, payload FROM evento WHERE entidad_tipo = 'ot' AND entidad_id = @0 ORDER BY id`, [
      ot.id,
    ]);
    expect(eventos.at(-1).tipo).toBe("cotizacion_vinculada");
    expect(JSON.parse(eventos.at(-1).payload)).toEqual({ cotizacionId: suelta.body.data.id, numero: suelta.body.data.numero });
  });

  it("cotización aprobada de OTRA OT: 409 COTIZACION_NO_VINCULABLE, no se reasigna", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
    const cliente = await crearClienteTest();
    const otA = await crearOtApi(gestion.auth, cliente.id);
    const otB = await crearOtApi(gestion.auth, cliente.id);
    const c = await post(gestion.auth, "/cotizaciones", cotizacionBody({ otId: otA.id }));
    await post(gestion.auth, `/cotizaciones/${c.body.data.id}/estado`, { estado: "enviada" });
    await post(gestion.auth, `/cotizaciones/${c.body.data.id}/estado`, { estado: "aprobada" });

    const res = await vincular(gestion.auth, otB.id, c.body.data.id);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("COTIZACION_NO_VINCULABLE");
    const detalle = await get(gestion.auth, `/cotizaciones/${c.body.data.id}`);
    expect(detalle.body.data.ot.id).toBe(otA.id);
  });

  it("cotización rechazada de OTRA OT: también 409", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
    const cliente = await crearClienteTest();
    const otA = await crearOtApi(gestion.auth, cliente.id);
    const otB = await crearOtApi(gestion.auth, cliente.id);
    const c = await post(gestion.auth, "/cotizaciones", cotizacionBody({ otId: otA.id }));
    await post(gestion.auth, `/cotizaciones/${c.body.data.id}/estado`, { estado: "enviada" });
    await post(gestion.auth, `/cotizaciones/${c.body.data.id}/estado`, { estado: "rechazada" });

    const res = await vincular(gestion.auth, otB.id, c.body.data.id);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("COTIZACION_NO_VINCULABLE");
  });

  it("cotización EN BORRADOR de otra OT: sí se puede reasignar (no es historial cerrado)", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
    const cliente = await crearClienteTest();
    const otA = await crearOtApi(gestion.auth, cliente.id);
    const otB = await crearOtApi(gestion.auth, cliente.id);
    const c = await post(gestion.auth, "/cotizaciones", cotizacionBody({ otId: otA.id }));

    const res = await vincular(gestion.auth, otB.id, c.body.data.id);

    expect(res.status).toBe(200);
    const detalle = await get(gestion.auth, `/cotizaciones/${c.body.data.id}`);
    expect(detalle.body.data.ot.id).toBe(otB.id);
  });

  it("vincular una cotización ya vinculada a la MISMA OT no rompe nada raro", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
    const cliente = await crearClienteTest();
    const ot = await crearOtApi(gestion.auth, cliente.id);
    const c = await post(gestion.auth, "/cotizaciones", cotizacionBody({ otId: ot.id }));

    const res = await vincular(gestion.auth, ot.id, c.body.data.id);

    expect(res.status).toBe(200);
    const detalle = await get(gestion.auth, `/cotizaciones/${c.body.data.id}`);
    expect(detalle.body.data.version).toBe(1); // no se recalculó de nuevo
  });

  it("respeta la regla de principal única: si la cotización vinculada es principal, desplaza a la anterior", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
    const cliente = await crearClienteTest();
    const ot = await crearOtApi(gestion.auth, cliente.id);
    await post(gestion.auth, "/cotizaciones", cotizacionBody({ otId: ot.id, esPrincipal: true }));
    const suelta = await post(gestion.auth, "/cotizaciones", cotizacionBody({ clienteId: cliente.id, esPrincipal: true }));

    await vincular(gestion.auth, ot.id, suelta.body.data.id);

    const filas = await principales(ot.id);
    const marcadas = filas.filter((f) => f.es_principal);
    expect(marcadas).toHaveLength(1);
    expect(marcadas[0]!.id.toLowerCase()).toBe(suelta.body.data.id);
  });

  it("OT inexistente: 404 OT_NO_ENCONTRADA", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
    const cliente = await crearClienteTest();
    const suelta = await post(gestion.auth, "/cotizaciones", cotizacionBody({ clienteId: cliente.id }));

    const res = await vincular(gestion.auth, "11111111-1111-4111-8111-111111111111", suelta.body.data.id);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("OT_NO_ENCONTRADA");
  });

  it("cotización inexistente: 404 COTIZACION_NO_ENCONTRADA", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
    const cliente = await crearClienteTest();
    const ot = await crearOtApi(gestion.auth, cliente.id);

    const res = await vincular(gestion.auth, ot.id, "11111111-1111-4111-8111-111111111111");

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("COTIZACION_NO_ENCONTRADA");
  });
});

describe("GET /ots/:id incluye las cotizaciones reales", () => {
  it("lista todas las cotizaciones de la OT, ordenadas por version descendente", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
    const cliente = await crearClienteTest();
    const ot = await crearOtApi(gestion.auth, cliente.id);
    const c1 = await post(gestion.auth, "/cotizaciones", cotizacionBody({ otId: ot.id, montoClp: 1000 }));
    const c2 = await post(gestion.auth, "/cotizaciones", cotizacionBody({ otId: ot.id, montoClp: 2000, esPrincipal: true }));

    const res = await get(gestion.auth, `/ots/${ot.id}`);

    expect(res.body.data.cotizaciones).toEqual([
      {
        id: c2.body.data.id,
        numero: c2.body.data.numero,
        montoClp: 2000,
        estado: "borrador",
        version: 2,
        esPrincipal: true,
        fecha: expect.any(String),
      },
      {
        id: c1.body.data.id,
        numero: c1.body.data.numero,
        montoClp: 1000,
        estado: "borrador",
        version: 1,
        esPrincipal: false,
        fecha: expect.any(String),
      },
    ]);
  });

  it("sin cotizaciones: arreglo vacío (no rompe el resto del detalle)", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
    const cliente = await crearClienteTest();
    const ot = await crearOtApi(gestion.auth, cliente.id);

    const res = await get(gestion.auth, `/ots/${ot.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.cotizaciones).toEqual([]);
    expect(res.body.data.numero).toBe(ot.numero);
  });
});
