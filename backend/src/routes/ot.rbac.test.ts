import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { env } from "../config/env.js";
import { rm } from "node:fs/promises";
import { conectarBD, limpiarBD } from "../test/helpers.js";
import { API, crearEscenario, otBody, type Escenario, type Sesion } from "../test/otHelpers.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(async () => {
  await rm(env.adjuntosDir, { recursive: true, force: true });
  await AppDataSource.destroy();
});

type Actor = "admin" | "gestion" | "resp" | "colab" | "ajeno" | "lectura" | "anon";
const ACTORES: Actor[] = ["admin", "gestion", "resp", "colab", "ajeno", "lectura", "anon"];

interface Peticion {
  metodo: "get" | "post" | "patch" | "delete";
  url: string;
  body?: object;
  archivo?: boolean;
}

interface Caso {
  nombre: string;
  // Prepara datos previos (con las sesiones del escenario) y devuelve la petición.
  armar: (e: Escenario, actor: Actor) => Promise<Peticion> | Peticion;
  // Estado HTTP esperado por actor. `2xx` = éxito (201 o 200 según el endpoint).
  ok: Actor[];
  exito: number;
}

const TODOS_AUTENTICADOS: Actor[] = ["admin", "gestion", "resp", "colab", "ajeno", "lectura"];
const EDITORES: Actor[] = ["admin", "gestion", "resp", "colab"]; // responsable o colaborador
const RESPONSABLES: Actor[] = ["admin", "gestion", "resp"]; // solo responsable actual (+ admin/gestion)
const CREADORES: Actor[] = ["admin", "gestion", "resp", "colab", "ajeno"]; // rol tecnico o más

const sesionDe = (e: Escenario, a: Actor): Sesion | null => (a === "anon" ? null : e[a]);
const hora = { fecha: "2026-09-01", horas: 1 };
const etapa = { nombre: "Etapa", fechaInicio: "2026-09-01", fechaTermino: "2026-09-02" };

async function crearComo(s: Sesion, url: string, body: object) {
  const r = await request(app).post(`${API}${url}`).set("Authorization", s.auth).send(body);
  return r.body.data;
}

const CASOS: Caso[] = [
  { nombre: "GET /ots", armar: () => ({ metodo: "get", url: "/ots" }), ok: TODOS_AUTENTICADOS, exito: 200 },
  { nombre: "GET /ots/kanban", armar: () => ({ metodo: "get", url: "/ots/kanban" }), ok: TODOS_AUTENTICADOS, exito: 200 },
  { nombre: "GET /ots/:id", armar: (e) => ({ metodo: "get", url: `/ots/${e.otId}` }), ok: TODOS_AUTENTICADOS, exito: 200 },
  {
    nombre: "POST /ots",
    armar: (e) => ({ metodo: "post", url: "/ots", body: otBody(e.cliente.id) }),
    ok: CREADORES,
    exito: 201,
  },
  {
    nombre: "PATCH /ots/:id",
    armar: (e) => ({ metodo: "patch", url: `/ots/${e.otId}`, body: { titulo: "Nuevo título" } }),
    ok: EDITORES,
    exito: 200,
  },
  {
    nombre: "POST /ots/:id/estado",
    armar: (e) => ({ metodo: "post", url: `/ots/${e.otId}/estado`, body: { estado: "en_ejecucion" } }),
    ok: EDITORES,
    exito: 200,
  },
  {
    nombre: "POST /ots/:id/derivar",
    armar: (e) => ({ metodo: "post", url: `/ots/${e.otId}/derivar`, body: { destinoId: e.extra.usuario.id, motivo: "Motivo de la derivación" } }),
    ok: RESPONSABLES,
    exito: 200,
  },
  {
    nombre: "POST /ots/:id/colaboradores",
    armar: (e) => ({ metodo: "post", url: `/ots/${e.otId}/colaboradores`, body: { usuarioId: e.extra.usuario.id } }),
    ok: RESPONSABLES,
    exito: 201,
  },
  {
    nombre: "DELETE /ots/:id/colaboradores/:usuarioId",
    armar: (e) => ({ metodo: "delete", url: `/ots/${e.otId}/colaboradores/${e.colab.usuario.id}` }),
    ok: RESPONSABLES,
    exito: 200,
  },
  { nombre: "GET /ots/:id/comentarios", armar: (e) => ({ metodo: "get", url: `/ots/${e.otId}/comentarios` }), ok: TODOS_AUTENTICADOS, exito: 200 },
  {
    nombre: "POST /ots/:id/comentarios",
    armar: (e) => ({ metodo: "post", url: `/ots/${e.otId}/comentarios`, body: { cuerpo: "Hola" } }),
    ok: EDITORES,
    exito: 201,
  },
  { nombre: "GET /ots/:id/horas", armar: (e) => ({ metodo: "get", url: `/ots/${e.otId}/horas` }), ok: TODOS_AUTENTICADOS, exito: 200 },
  {
    // Horas propias: gestion/admin siempre; tecnico solo si es responsable o colaborador (el ajeno recibe 403); lectura no.
    nombre: "POST /ots/:id/horas (propias)",
    armar: (e) => ({ metodo: "post", url: `/ots/${e.otId}/horas`, body: hora }),
    ok: EDITORES,
    exito: 201,
  },
  {
    nombre: "POST /ots/:id/horas (de otro usuario)",
    armar: (e) => ({ metodo: "post", url: `/ots/${e.otId}/horas`, body: { ...hora, usuarioId: e.extra.usuario.id } }),
    ok: ["admin", "gestion"],
    exito: 201,
  },
  {
    // La hora la registra y luego la borra el mismo actor: propias.
    nombre: "DELETE /ots/:id/horas/:horaId (propia)",
    armar: async (e, actor) => {
      // Se registra vía admin a nombre del actor: el ajeno ya no puede registrar, pero sí borrar las suyas.
      const duenio = actor === "lectura" || actor === "anon" ? e.admin : e[actor];
      const creada = await crearComo(e.admin, `/ots/${e.otId}/horas`, { ...hora, usuarioId: duenio.usuario.id });
      return { metodo: "delete", url: `/ots/${e.otId}/horas/${creada.hora.id}` };
    },
    ok: CREADORES,
    exito: 200,
  },
  {
    // Hora de un tercero (registrada vía admin a nombre de `extra`): solo admin/gestion la borran de ajena.
    nombre: "DELETE /ots/:id/horas/:horaId (ajena)",
    armar: async (e) => {
      const creada = await crearComo(e.admin, `/ots/${e.otId}/horas`, { ...hora, usuarioId: e.extra.usuario.id });
      return { metodo: "delete", url: `/ots/${e.otId}/horas/${creada.hora.id}` };
    },
    ok: ["admin", "gestion"],
    exito: 200,
  },
  { nombre: "GET /ots/:id/etapas", armar: (e) => ({ metodo: "get", url: `/ots/${e.otId}/etapas` }), ok: TODOS_AUTENTICADOS, exito: 200 },
  {
    nombre: "POST /ots/:id/etapas",
    armar: (e) => ({ metodo: "post", url: `/ots/${e.otId}/etapas`, body: etapa }),
    ok: RESPONSABLES,
    exito: 201,
  },
  {
    nombre: "PATCH /ots/:id/etapas/:etapaId",
    armar: async (e) => {
      const creada = await crearComo(e.admin, `/ots/${e.otId}/etapas`, etapa);
      return { metodo: "patch", url: `/ots/${e.otId}/etapas/${creada.id}`, body: { nombre: "Otro" } };
    },
    ok: RESPONSABLES,
    exito: 200,
  },
  {
    nombre: "DELETE /ots/:id/etapas/:etapaId",
    armar: async (e) => {
      const creada = await crearComo(e.admin, `/ots/${e.otId}/etapas`, etapa);
      return { metodo: "delete", url: `/ots/${e.otId}/etapas/${creada.id}` };
    },
    ok: RESPONSABLES,
    exito: 200,
  },
  {
    nombre: "POST /adjuntos",
    armar: (e) => ({ metodo: "post", url: "/adjuntos", archivo: true, body: { entidadTipo: "ot", entidadId: e.otId } }),
    ok: EDITORES,
    exito: 201,
  },
  {
    nombre: "GET /adjuntos/:id/descargar",
    armar: async (e) => {
      const r = await request(app)
        .post(`${API}/adjuntos`)
        .set("Authorization", e.admin.auth)
        .field("entidadTipo", "ot")
        .field("entidadId", e.otId)
        .attach("archivo", Buffer.from("hola"), { filename: "a.txt", contentType: "text/plain" });
      return { metodo: "get", url: `/adjuntos/${r.body.data.id}/descargar` };
    },
    ok: TODOS_AUTENTICADOS,
    exito: 200,
  },
];

describe.each(CASOS)("RBAC: $nombre", (caso) => {
  it.each(ACTORES)("%s", async (actor) => {
    const e = await crearEscenario();
    const p = await caso.armar(e, actor);
    const s = sesionDe(e, actor);

    let r = request(app)[p.metodo](`${API}${p.url}`);
    if (s) r = r.set("Authorization", s.auth);
    if (p.archivo) {
      for (const [k, v] of Object.entries(p.body ?? {})) r = r.field(k, String(v));
      r = r.attach("archivo", Buffer.from("contenido"), { filename: "nota.txt", contentType: "text/plain" });
    } else if (p.body) {
      r = r.send(p.body);
    }
    const res = await r;

    const esperado = actor === "anon" ? 401 : caso.ok.includes(actor) ? caso.exito : 403;
    expect(res.status, JSON.stringify(res.body)).toBe(esperado);
    if (esperado === 403) expect(["PERMISO_DENEGADO", "FORBIDDEN"]).toContain(res.body.code);
  });
});
