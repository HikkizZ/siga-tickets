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

const get = (auth: string, url: string) => request(app).get(`${API}${url}`).set("Authorization", auth);
const post = (auth: string, url: string, body: object) => request(app).post(`${API}${url}`).set("Authorization", auth).send(body);
const numeros = (res: request.Response) => res.body.data.map((c: { numero: string }) => c.numero);

describe("GET /cotizaciones", () => {
  async function sembrar() {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
    const c1 = await crearClienteTest("Cliente Percy Uno");
    const c2 = await crearClienteTest("Cliente Dos");
    const ot = await crearOtApi(gestion.auth, c1.id);

    const a = await post(gestion.auth, "/cotizaciones", cotizacionBody({ clienteId: c1.id, montoClp: 100 })); // COT-2041
    const b = await post(gestion.auth, "/cotizaciones", cotizacionBody({ clienteId: c2.id, montoClp: 200, fecha: "2026-01-15" })); // COT-2042
    const c = await post(gestion.auth, "/cotizaciones", cotizacionBody({ otId: ot.id, montoClp: 300 })); // COT-2043
    await post(gestion.auth, `/cotizaciones/${b.body.data.id}/estado`, { estado: "enviada" });
    return { gestion, c1, c2, ot, a: a.body.data, b: b.body.data, c: c.body.data };
  }

  it("paginación y meta", async () => {
    const s = await sembrar();

    const p1 = await get(s.gestion.auth, "/cotizaciones?perPage=2&page=1&orden=numero&dir=asc");
    const p2 = await get(s.gestion.auth, "/cotizaciones?perPage=2&page=2&orden=numero&dir=asc");

    expect(p1.body.meta).toEqual({ page: 1, perPage: 2, total: 3 });
    expect(numeros(p1)).toEqual(["COT-2041", "COT-2042"]);
    expect(numeros(p2)).toEqual(["COT-2043"]);
  });

  it("orden por columna de la lista blanca; fuera de ella: 400", async () => {
    const s = await sembrar();

    const porMonto = await get(s.gestion.auth, "/cotizaciones?orden=montoClp&dir=desc");
    const malo = await get(s.gestion.auth, "/cotizaciones?orden=passwordHash");
    const inyeccion = await get(s.gestion.auth, "/cotizaciones?orden=numero;DROP TABLE cotizacion");
    const dirMala = await get(s.gestion.auth, "/cotizaciones?dir=sideways");

    expect(numeros(porMonto)).toEqual(["COT-2043", "COT-2042", "COT-2041"]);
    expect(malo.status).toBe(400);
    expect(inyeccion.status).toBe(400);
    expect(dirMala.status).toBe(400);
  });

  it("filtros: estado, clienteId, otId, desde/hasta", async () => {
    const s = await sembrar();
    const ids = async (q: string) => numeros(await get(s.gestion.auth, `/cotizaciones?orden=numero&dir=asc&${q}`));

    expect(await ids("estado=enviada")).toEqual(["COT-2042"]);
    // COT-2043 también es de c1: su clienteId se autocompletó desde ot.clienteId al crearla.
    expect(await ids(`clienteId=${s.c1.id}`)).toEqual(["COT-2041", "COT-2043"]);
    expect(await ids(`otId=${s.ot.id}`)).toEqual(["COT-2043"]);
    expect(await ids("desde=2026-01-01&hasta=2026-01-31")).toEqual(["COT-2042"]);
    expect(await ids("desde=2999-01-01")).toEqual([]);
    expect((await get(s.gestion.auth, "/cotizaciones?desde=2026-05-02&hasta=2026-05-01")).status).toBe(400);
  });

  it("q busca por numero o nombre de cliente", async () => {
    const s = await sembrar();
    const q = async (t: string) => numeros(await get(s.gestion.auth, `/cotizaciones?orden=numero&dir=asc&q=${encodeURIComponent(t)}`));

    expect(await q("COT-2042")).toEqual(["COT-2042"]);
    // Coincide con COT-2041 (cliente directo) y COT-2043 (clienteId autocompletado desde la OT).
    expect(await q("percy")).toEqual(["COT-2041", "COT-2043"]);
  });

  it("q trata % _ y [ como texto literal (mismo escape que OT)", async () => {
    const s = await sembrar();
    const cliente100 = await crearClienteTest("100% Cliente");
    await post(s.gestion.auth, "/cotizaciones", cotizacionBody({ clienteId: cliente100.id })); // COT-2044
    const q = async (t: string) => numeros(await get(s.gestion.auth, `/cotizaciones?orden=numero&dir=asc&q=${encodeURIComponent(t)}`));

    expect(await q("100%")).toEqual(["COT-2044"]);
    expect(await q("percy")).toEqual(["COT-2041", "COT-2043"]); // sigue funcionando junto a los demás filtros
  });

  it("los elementos del listado tienen la forma esperada", async () => {
    const s = await sembrar();

    const res = await get(s.gestion.auth, "/cotizaciones?orden=numero&dir=asc&perPage=1");

    expect(res.body.data[0]).toEqual({
      id: s.a.id,
      numero: "COT-2041",
      ot: null,
      cliente: { id: s.c1.id, nombre: "Cliente Percy Uno" },
      montoClp: 100,
      fecha: expect.any(String),
      estado: "borrador",
      version: 1,
      esPrincipal: false,
      creadoEn: expect.any(String),
      actualizadoEn: expect.any(String),
    });
  });
});

describe("GET /cotizaciones/:id", () => {
  it("404 si no existe; 400 si el id no es uuid", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");

    const a = await get(gestion.auth, "/cotizaciones/11111111-1111-4111-8111-111111111111");
    const b = await get(gestion.auth, "/cotizaciones/no-es-uuid");

    expect(a.status).toBe(404);
    expect(a.body.code).toBe("COTIZACION_NO_ENCONTRADA");
    expect(b.status).toBe(400);
  });

  it("detalle con OT, cliente y timeline propio (creación + estado + edición)", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
    const cliente = await crearClienteTest();
    const ot = await crearOtApi(gestion.auth, cliente.id);
    const creada = await post(gestion.auth, "/cotizaciones", cotizacionBody({ otId: ot.id, montoClp: 500 }));
    const id = creada.body.data.id;
    await post(gestion.auth, `/cotizaciones/${id}/estado`, { estado: "enviada" });
    await request(app).patch(`${API}/cotizaciones/${id}`).set("Authorization", gestion.auth).send({ montoClp: 700 }).expect(409); // ya no es borrador
    await post(gestion.auth, `/cotizaciones/${id}/estado`, { estado: "borrador" });
    await request(app).patch(`${API}/cotizaciones/${id}`).set("Authorization", gestion.auth).send({ montoClp: 700 });

    const res = await get(gestion.auth, `/cotizaciones/${id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.ot).toMatchObject({ id: ot.id, numero: ot.numero, titulo: ot.titulo });
    expect(res.body.data.cliente).toEqual({ id: cliente.id, nombre: cliente.nombre });
    expect(res.body.data.montoClp).toBe(700);
    // más recientes primero: editada, estado borrador, estado enviada, creada (reflejada en la OT)
    const tipos = res.body.data.eventos.map((e: { tipo: string }) => e.tipo);
    expect(tipos).toEqual(["cotizacion_editada", "cotizacion_estado_cambiado", "cotizacion_estado_cambiado", "cotizacion_creada"]);
  });

  it("ningún DTO expone campos internos que no correspondan (id/nombre de usuario nada más)", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
    const cliente = await crearClienteTest();
    const ot = await crearOtApi(gestion.auth, cliente.id);
    const creada = await post(gestion.auth, "/cotizaciones", cotizacionBody({ otId: ot.id }));

    const detalle = await get(gestion.auth, `/cotizaciones/${creada.body.data.id}`);
    const lista = await get(gestion.auth, "/cotizaciones");

    for (const json of [JSON.stringify(detalle.body), JSON.stringify(lista.body)]) {
      for (const prohibido of ["passwordHash", "password_hash", "mustChangePassword", "email", "@test.local", "username", "anuladaEn", "anulada_en"]) {
        expect(json).not.toContain(prohibido);
      }
    }
    for (const ev of detalle.body.data.eventos) {
      if (ev.actor) expect(Object.keys(ev.actor).sort()).toEqual(["id", "nombre"]);
    }
    expect(Object.keys(detalle.body.data).sort()).toEqual(
      ["id", "numero", "ot", "cliente", "montoClp", "fecha", "estado", "version", "esPrincipal", "aprobadaEn", "creadoEn", "actualizadoEn", "eventos"].sort(),
    );
  });
});
