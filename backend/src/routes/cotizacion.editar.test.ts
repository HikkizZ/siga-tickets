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
const patch = (auth: string, url: string, body: object) => request(app).patch(`${API}${url}`).set("Authorization", auth).send(body);

async function eventosCotizacion(id: string) {
  return (await AppDataSource.query(`SELECT tipo, payload FROM evento WHERE entidad_tipo = 'cotizacion' AND entidad_id = @0 ORDER BY id`, [
    id,
  ])) as Array<{ tipo: string; payload: string }>;
}

describe("PATCH /cotizaciones/:id", () => {
  it("404 si no existe", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");

    const res = await patch(gestion.auth, "/cotizaciones/11111111-1111-4111-8111-111111111111", { montoClp: 1 });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("COTIZACION_NO_ENCONTRADA");
  });

  it("solo en estado borrador: 409 si ya se envió", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
    const cliente = await crearClienteTest();
    const creada = await post(gestion.auth, "/cotizaciones", cotizacionBody({ clienteId: cliente.id }));
    await post(gestion.auth, `/cotizaciones/${creada.body.data.id}/estado`, { estado: "enviada" });

    const res = await patch(gestion.auth, `/cotizaciones/${creada.body.data.id}`, { montoClp: 999 });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("COTIZACION_ESTADO_INVALIDO");
  });

  it("edita montoClp y fecha; evento cotizacion_editada con antes/después de montoClp", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
    const cliente = await crearClienteTest();
    const creada = await post(gestion.auth, "/cotizaciones", cotizacionBody({ clienteId: cliente.id, montoClp: 100 }));

    const res = await patch(gestion.auth, `/cotizaciones/${creada.body.data.id}`, { montoClp: 250, fecha: "2026-03-01" });

    expect(res.status).toBe(200);
    expect(res.body.data.montoClp).toBe(250);
    expect(res.body.data.fecha).toBe("2026-03-01");
    const eventos = await eventosCotizacion(creada.body.data.id);
    expect(eventos.map((e) => e.tipo)).toEqual(["cotizacion_editada"]);
    const payload = JSON.parse(eventos[0]!.payload);
    expect(payload.campos.sort()).toEqual(["fecha", "montoClp"]);
    expect(payload).toMatchObject({ montoClpAntes: 100, montoClpDespues: 250 });
  });

  it("sin cambios reales: 200 y ningún evento", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
    const cliente = await crearClienteTest();
    const creada = await post(gestion.auth, "/cotizaciones", cotizacionBody({ clienteId: cliente.id, montoClp: 100 }));

    const res = await patch(gestion.auth, `/cotizaciones/${creada.body.data.id}`, { montoClp: 100 });

    expect(res.status).toBe(200);
    expect(await eventosCotizacion(creada.body.data.id)).toHaveLength(0);
  });

  it("cambiar clienteId a uno que no coincide con el de la OT (no interna): 400 claro", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
    const cliente = await crearClienteTest();
    const otroCliente = await crearClienteTest("Otro");
    const ot = await crearOtApi(gestion.auth, cliente.id);
    const creada = await post(gestion.auth, "/cotizaciones", cotizacionBody({ otId: ot.id }));

    const res = await patch(gestion.auth, `/cotizaciones/${creada.body.data.id}`, { clienteId: otroCliente.id });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("CLIENTE_NO_COINCIDE");
  });

  it("clienteId inexistente o inactivo: 400 CLIENTE_INVALIDO", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
    const cliente = await crearClienteTest();
    const inactivo = await crearClienteTest("Inactivo SA", false);
    const creada = await post(gestion.auth, "/cotizaciones", cotizacionBody({ clienteId: cliente.id }));

    const res = await patch(gestion.auth, `/cotizaciones/${creada.body.data.id}`, { clienteId: inactivo.id });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("CLIENTE_INVALIDO");
  });

  it("body vacío: 400 (nada para actualizar)", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
    const cliente = await crearClienteTest();
    const creada = await post(gestion.auth, "/cotizaciones", cotizacionBody({ clienteId: cliente.id }));

    const res = await patch(gestion.auth, `/cotizaciones/${creada.body.data.id}`, {});

    expect(res.status).toBe(400);
  });
});
