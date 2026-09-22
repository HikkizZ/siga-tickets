import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { conectarBD, limpiarBD } from "../test/helpers.js";
import { API } from "../test/otHelpers.js";
import { crearEscenarioTicket, crearTicketApi, ticketBody, type EscenarioTicket } from "../test/ticketHelpers.js";
import type { Sesion } from "../test/otHelpers.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

// Sin "colab": el ticket no tiene colaboradores (punto 1 del encargo de la Fase 3).
type Actor = "admin" | "gestion" | "resp" | "ajeno" | "lectura" | "anon";
const ACTORES: Actor[] = ["admin", "gestion", "resp", "ajeno", "lectura", "anon"];

interface Peticion {
  metodo: "get" | "post" | "patch" | "delete";
  url: string;
  body?: object;
}

interface Caso {
  nombre: string;
  armar: (e: EscenarioTicket, actor: Actor) => Promise<Peticion> | Peticion;
  ok: Actor[];
  exito: number;
}

const TODOS_AUTENTICADOS: Actor[] = ["admin", "gestion", "resp", "ajeno", "lectura"];
const RESPONSABLES: Actor[] = ["admin", "gestion", "resp"]; // solo responsable actual (+ admin/gestion): sin colaborador
const CREADORES: Actor[] = ["admin", "gestion", "resp", "ajeno"]; // rol tecnico o más
const GESTORES: Actor[] = ["admin", "gestion"]; // convertir/vincular: sin excepción por fila

const sesionDe = (e: EscenarioTicket, a: Actor): Sesion | null => (a === "anon" ? null : e[a]);

const CASOS: Caso[] = [
  { nombre: "GET /tickets", armar: () => ({ metodo: "get", url: "/tickets" }), ok: TODOS_AUTENTICADOS, exito: 200 },
  { nombre: "POST /tickets", armar: () => ({ metodo: "post", url: "/tickets", body: ticketBody() }), ok: CREADORES, exito: 201 },
  { nombre: "GET /tickets/:id", armar: (e) => ({ metodo: "get", url: `/tickets/${e.ticketId}` }), ok: TODOS_AUTENTICADOS, exito: 200 },
  {
    nombre: "PATCH /tickets/:id",
    armar: (e) => ({ metodo: "patch", url: `/tickets/${e.ticketId}`, body: { asunto: "Nuevo asunto" } }),
    ok: RESPONSABLES,
    exito: 200,
  },
  {
    nombre: "POST /tickets/:id/estado",
    armar: (e) => ({ metodo: "post", url: `/tickets/${e.ticketId}/estado`, body: { estado: "resuelto" } }),
    ok: RESPONSABLES,
    exito: 200,
  },
  {
    nombre: "POST /tickets/:id/mensajes",
    armar: (e) => ({ metodo: "post", url: `/tickets/${e.ticketId}/mensajes`, body: { tipo: "nota_interna", cuerpo: "Hola" } }),
    ok: RESPONSABLES,
    exito: 201,
  },
  {
    nombre: "POST /tickets/:id/derivar",
    armar: (e) => ({ metodo: "post", url: `/tickets/${e.ticketId}/derivar`, body: { destinoId: e.extra.usuario.id, motivo: "Motivo de la derivación" } }),
    ok: RESPONSABLES,
    exito: 200,
  },
  {
    // Cada actor toma un ticket NUEVO (sin responsable): tecnico+ puede, lectura no. Siempre lo
    // crea admin (crear ya tiene su propio caso de RBAC arriba).
    nombre: "POST /tickets/:id/tomar",
    armar: async (e) => {
      const t = await crearTicketApi(e.admin.auth);
      return { metodo: "post", url: `/tickets/${t.id}/tomar` };
    },
    ok: CREADORES,
    exito: 200,
  },
  {
    nombre: "POST /tickets/:id/convertir-a-ot",
    armar: (e) => ({ metodo: "post", url: `/tickets/${e.ticketId}/convertir-a-ot`, body: { categoria: "soporte", clienteId: e.cliente.id } }),
    ok: GESTORES,
    exito: 201,
  },
  {
    nombre: "POST /tickets/:id/ots",
    armar: async (e) => {
      const ot = await request(app)
        .post(`${API}/ots`)
        .set("Authorization", e.admin.auth)
        .send({ titulo: "OT", descripcion: "d", clienteId: e.cliente.id, categoria: "soporte", prioridad: "media", origen: "telefono" });
      return { metodo: "post", url: `/tickets/${e.ticketId}/ots`, body: { otId: ot.body.data.id } };
    },
    ok: GESTORES,
    exito: 201,
  },
  {
    nombre: "DELETE /tickets/:id/ots/:otId",
    armar: async (e) => {
      const ot = await request(app)
        .post(`${API}/ots`)
        .set("Authorization", e.admin.auth)
        .send({ titulo: "OT", descripcion: "d", clienteId: e.cliente.id, categoria: "soporte", prioridad: "media", origen: "telefono" });
      await request(app).post(`${API}/tickets/${e.ticketId}/ots`).set("Authorization", e.admin.auth).send({ otId: ot.body.data.id });
      return { metodo: "delete", url: `/tickets/${e.ticketId}/ots/${ot.body.data.id}` };
    },
    ok: GESTORES,
    exito: 200,
  },
  { nombre: "GET /tickets/:id/eventos", armar: (e) => ({ metodo: "get", url: `/tickets/${e.ticketId}/eventos` }), ok: TODOS_AUTENTICADOS, exito: 200 },
];

describe.each(CASOS)("RBAC ticket: $nombre", (caso) => {
  it.each(ACTORES)("%s", async (actor) => {
    const e = await crearEscenarioTicket();
    const p = await caso.armar(e, actor);
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
