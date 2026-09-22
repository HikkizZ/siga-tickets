import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { conectarBD, limpiarBD } from "../test/helpers.js";
import { API, cotizacionBody, crearEscenario, type Escenario, type Sesion } from "../test/otHelpers.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

type Actor = "admin" | "gestion" | "resp" | "colab" | "ajeno" | "lectura" | "anon";
const ACTORES: Actor[] = ["admin", "gestion", "resp", "colab", "ajeno", "lectura", "anon"];
const sesionDe = (e: Escenario, a: Actor): Sesion | null => (a === "anon" ? null : e[a]);

// A diferencia de OT, ni "resp" (responsable de la OT) ni "colab" tienen ninguna excepción de
// escritura: sección 6 del diseño dice admin/gestion sin excepción por fila.
const ESCRITORES: Actor[] = ["admin", "gestion"];
const LECTORES: Actor[] = ["admin", "gestion", "resp", "colab", "ajeno", "lectura"];

interface Peticion {
  metodo: "get" | "post" | "patch";
  url: string;
  body?: object;
}

interface Caso {
  nombre: string;
  armar: (e: Escenario) => Promise<Peticion> | Peticion;
  ok: Actor[];
  exito: number;
}

async function crearComo(auth: string, url: string, body: object) {
  const r = await request(app).post(`${API}${url}`).set("Authorization", auth).send(body);
  if (r.status >= 400) throw new Error(`crearComo falló: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.data;
}

const CASOS: Caso[] = [
  { nombre: "GET /cotizaciones", armar: () => ({ metodo: "get", url: "/cotizaciones" }), ok: LECTORES, exito: 200 },
  {
    nombre: "POST /cotizaciones",
    armar: (e) => ({ metodo: "post", url: "/cotizaciones", body: cotizacionBody({ clienteId: e.cliente.id }) }),
    ok: ESCRITORES,
    exito: 201,
  },
  {
    nombre: "GET /cotizaciones/:id",
    armar: async (e) => {
      const c = await crearComo(e.admin.auth, "/cotizaciones", cotizacionBody({ clienteId: e.cliente.id }));
      return { metodo: "get", url: `/cotizaciones/${c.id}` };
    },
    ok: LECTORES,
    exito: 200,
  },
  {
    nombre: "PATCH /cotizaciones/:id",
    armar: async (e) => {
      const c = await crearComo(e.admin.auth, "/cotizaciones", cotizacionBody({ clienteId: e.cliente.id }));
      return { metodo: "patch", url: `/cotizaciones/${c.id}`, body: { montoClp: 999 } };
    },
    ok: ESCRITORES,
    exito: 200,
  },
  {
    nombre: "POST /cotizaciones/:id/estado",
    armar: async (e) => {
      const c = await crearComo(e.admin.auth, "/cotizaciones", cotizacionBody({ clienteId: e.cliente.id }));
      return { metodo: "post", url: `/cotizaciones/${c.id}/estado`, body: { estado: "enviada" } };
    },
    ok: ESCRITORES,
    exito: 200,
  },
  {
    nombre: "POST /ots/:id/cotizaciones/vincular",
    armar: async (e) => {
      const c = await crearComo(e.admin.auth, "/cotizaciones", cotizacionBody({ clienteId: e.cliente.id }));
      return { metodo: "post", url: `/ots/${e.otId}/cotizaciones/vincular`, body: { cotizacionId: c.id } };
    },
    ok: ESCRITORES,
    exito: 200,
  },
];

describe.each(CASOS)("RBAC cotizaciones: $nombre", (caso) => {
  it.each(ACTORES)("%s", async (actor) => {
    const e = await crearEscenario();
    const p = await caso.armar(e);
    const s = sesionDe(e, actor);

    let r = request(app)[p.metodo](`${API}${p.url}`);
    if (s) r = r.set("Authorization", s.auth);
    if (p.body) r = r.send(p.body);
    const res = await r;

    const esperado = actor === "anon" ? 401 : caso.ok.includes(actor) ? caso.exito : 403;
    expect(res.status, JSON.stringify(res.body)).toBe(esperado);
    if (esperado === 403) expect(["PERMISO_DENEGADO", "FORBIDDEN"]).toContain(res.body.code);
  });
});

describe("un tecnico responsable de la OT NO tiene acceso de escritura a cotizaciones (a diferencia de OT)", () => {
  it("POST /cotizaciones con otId de una OT donde es responsable: 403", async () => {
    const e = await crearEscenario();

    const res = await request(app)
      .post(`${API}/cotizaciones`)
      .set("Authorization", e.resp.auth)
      .send(cotizacionBody({ otId: e.otId }));

    expect(res.status).toBe(403);
  });

  it("POST /ots/:id/cotizaciones/vincular siendo el responsable de esa OT: 403", async () => {
    const e = await crearEscenario();
    const suelta = await crearComo(e.admin.auth, "/cotizaciones", cotizacionBody({ clienteId: e.cliente.id }));

    const res = await request(app)
      .post(`${API}/ots/${e.otId}/cotizaciones/vincular`)
      .set("Authorization", e.resp.auth)
      .send({ cotizacionId: suelta.id });

    expect(res.status).toBe(403);
  });

  it("colaborador de la OT tampoco puede editar ni cambiar estado", async () => {
    const e = await crearEscenario();
    const c = await crearComo(e.admin.auth, "/cotizaciones", cotizacionBody({ otId: e.otId }));

    const editar = await request(app).patch(`${API}/cotizaciones/${c.id}`).set("Authorization", e.colab.auth).send({ montoClp: 1 });
    const cambiarEstado = await request(app)
      .post(`${API}/cotizaciones/${c.id}/estado`)
      .set("Authorization", e.colab.auth)
      .send({ estado: "enviada" });

    expect(editar.status).toBe(403);
    expect(cambiarEstado.status).toBe(403);
  });
});

describe("lectura puede ver pero nunca escribir cotizaciones", () => {
  it("GET listado y detalle: 200; escritura: 403 en todos los endpoints", async () => {
    const e = await crearEscenario();
    const c = await crearComo(e.admin.auth, "/cotizaciones", cotizacionBody({ clienteId: e.cliente.id }));

    const lista = await request(app).get(`${API}/cotizaciones`).set("Authorization", e.lectura.auth);
    const detalle = await request(app).get(`${API}/cotizaciones/${c.id}`).set("Authorization", e.lectura.auth);
    const crear = await request(app).post(`${API}/cotizaciones`).set("Authorization", e.lectura.auth).send(cotizacionBody({ clienteId: e.cliente.id }));

    expect(lista.status).toBe(200);
    expect(detalle.status).toBe(200);
    expect(crear.status).toBe(403);
  });
});
