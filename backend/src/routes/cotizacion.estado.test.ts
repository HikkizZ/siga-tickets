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

let contadorCliente = 0;

// Cliente con nombre único por llamada: algunos tests invocan crear() más de una vez y
// crearClienteTest() por defecto siempre usa el mismo nombre ("Cliente Test"), que violaría el
// UNIQUE de cliente.nombre dentro del mismo test (limpiarBD solo corre entre tests, no dentro).
async function crear(auth: string, extra: Record<string, unknown> = {}) {
  const cliente = await crearClienteTest(`Cliente estado ${++contadorCliente}`);
  const res = await post(auth, "/cotizaciones", cotizacionBody({ clienteId: cliente.id, ...extra }));
  return res.body.data as { id: string };
}

const estado = (auth: string, id: string, estado: string) => post(auth, `/cotizaciones/${id}/estado`, { estado });

describe("POST /cotizaciones/:id/estado", () => {
  it.each([
    ["borrador", "enviada"],
    ["enviada", "aprobada"],
    ["enviada", "rechazada"],
    ["enviada", "borrador"],
    ["rechazada", "enviada"],
  ])("%s -> %s es válida", async (desde, hasta) => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
    const c = await crear(gestion.auth);
    // Lleva la cotización al estado `desde` antes de probar la transición.
    const RUTA: Record<string, string[]> = {
      borrador: [],
      enviada: ["enviada"],
      rechazada: ["enviada", "rechazada"],
    };
    for (const paso of RUTA[desde]!) await estado(gestion.auth, c.id, paso);

    const res = await estado(gestion.auth, c.id, hasta);

    expect(res.status).toBe(200);
    expect(res.body.data.estado).toBe(hasta);
  });

  it.each([
    ["borrador", "aprobada"],
    ["borrador", "rechazada"],
    ["borrador", "borrador"],
    ["enviada", "enviada"],
    ["aprobada", "enviada"],
    ["aprobada", "aprobada"],
    ["aprobada", "borrador"],
    ["aprobada", "rechazada"],
    ["rechazada", "aprobada"],
    ["rechazada", "rechazada"],
    ["rechazada", "borrador"],
  ])("%s -> %s es inválida: 409 TRANSICION_INVALIDA", async (desde, hasta) => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
    const c = await crear(gestion.auth);
    const RUTA: Record<string, string[]> = {
      borrador: [],
      enviada: ["enviada"],
      aprobada: ["enviada", "aprobada"],
      rechazada: ["enviada", "rechazada"],
    };
    for (const paso of RUTA[desde]!) await estado(gestion.auth, c.id, paso);

    const res = await estado(gestion.auth, c.id, hasta);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("TRANSICION_INVALIDA");
  });

  it("estado inexistente en el enum: 400", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
    const c = await crear(gestion.auth);

    const res = await estado(gestion.auth, c.id, "cancelada");

    expect(res.status).toBe(400);
  });

  it("404 si la cotización no existe", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");

    const res = await estado(gestion.auth, "11111111-1111-4111-8111-111111111111", "enviada");

    expect(res.status).toBe(404);
  });

  it("aprobadaEn se fija la primera vez que llega a aprobada y no se pisa después", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
    const c = await crear(gestion.auth);
    await estado(gestion.auth, c.id, "enviada");

    const aprobada = await estado(gestion.auth, c.id, "aprobada");
    expect(aprobada.body.data.aprobadaEn).not.toBeNull();
    const primera = aprobada.body.data.aprobadaEn;

    // Con las transiciones permitidas hoy no hay forma de volver a 'aprobada' una segunda vez,
    // pero se verifica igual que el valor ya fijado no cambia si se relee.
    await new Promise((r) => setTimeout(r, 20));
    const detalle = await get(gestion.auth, `/cotizaciones/${c.id}`);
    expect(detalle.body.data.aprobadaEn).toBe(primera);
  });

  it("evento cotizacion_estado_cambiado: en la cotización siempre, y en la OT solo si tiene otId", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
    const cliente = await crearClienteTest();
    const ot = await crearOtApi(gestion.auth, cliente.id);
    const conOt = await post(gestion.auth, "/cotizaciones", cotizacionBody({ otId: ot.id }));
    const sinOt = await crear(gestion.auth);

    await estado(gestion.auth, conOt.body.data.id, "enviada");
    await estado(gestion.auth, sinOt.id, "enviada");

    const evCot1 = await AppDataSource.query(`SELECT tipo FROM evento WHERE entidad_tipo = 'cotizacion' AND entidad_id = @0`, [
      conOt.body.data.id,
    ]);
    const evCot2 = await AppDataSource.query(`SELECT tipo FROM evento WHERE entidad_tipo = 'cotizacion' AND entidad_id = @0`, [sinOt.id]);
    const evOt = await AppDataSource.query(`SELECT tipo, payload FROM evento WHERE entidad_tipo = 'ot' AND entidad_id = @0 ORDER BY id`, [
      ot.id,
    ]);

    expect(evCot1.map((e: { tipo: string }) => e.tipo)).toEqual(["cotizacion_estado_cambiado"]);
    expect(evCot2.map((e: { tipo: string }) => e.tipo)).toEqual(["cotizacion_estado_cambiado"]);
    expect(evOt.map((e: { tipo: string }) => e.tipo)).toEqual(["creado", "cotizacion_creada", "cotizacion_estado_cambiado"]);
    expect(JSON.parse(evOt[2].payload)).toEqual({ cotizacionId: conOt.body.data.id, de: "borrador", a: "enviada" });
  });

  it("el timeline propio de la cotización no duplica el cambio de estado reflejado en la OT", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
    const cliente = await crearClienteTest();
    const ot = await crearOtApi(gestion.auth, cliente.id);
    const c = await post(gestion.auth, "/cotizaciones", cotizacionBody({ otId: ot.id }));
    await estado(gestion.auth, c.body.data.id, "enviada");

    const detalle = await get(gestion.auth, `/cotizaciones/${c.body.data.id}`);

    const tipos = detalle.body.data.eventos.map((e: { tipo: string }) => e.tipo);
    expect(tipos).toEqual(["cotizacion_estado_cambiado", "cotizacion_creada"]);
  });
});
