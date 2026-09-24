import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { conectarBD, limpiarBD, obtenerCanalTicketPorNombre, obtenerEstadoTicketPorNombre, obtenerPrioridadPorNombre } from "../test/helpers.js";
import { API } from "../test/otHelpers.js";
import { crearEscenarioTicket } from "../test/ticketHelpers.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

const mensaje = (auth: string, id: string, body: object) => request(app).post(`${API}/tickets/${id}/mensajes`).set("Authorization", auth).send(body);
const ticket = async (auth: string, id: string) => (await request(app).get(`${API}/tickets/${id}`).set("Authorization", auth)).body.data;

describe("POST /tickets/:id/mensajes", () => {
  it("nota_interna: no cambia el estado del ticket en ningún momento", async () => {
    const e = await crearEscenarioTicket();

    const res = await mensaje(e.resp.auth, e.ticketId, { tipo: "nota_interna", cuerpo: "Revisar cableado" });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ tipo: "nota_interna", autor: { id: e.resp.usuario.id } });
    const t = await ticket(e.resp.auth, e.ticketId);
    expect(t.estado.nombre).toBe("Nuevo"); // tomar no cambia el estado; nota_interna tampoco
    expect(t.primeraRespuestaEn).toBeNull();

    const ev = await AppDataSource.query(`SELECT tipo, payload FROM evento WHERE entidad_tipo = 'ticket' AND tipo = 'nota_interna'`);
    expect(JSON.parse(ev[0].payload)).toEqual({ mensajeId: res.body.data.id });
  });

  it("primera respuesta_cliente fija primera_respuesta_en una sola vez y pasa nuevo→abierto", async () => {
    const admin = (await crearEscenarioTicket()).admin;
    const [canal, prioridad] = await Promise.all([obtenerCanalTicketPorNombre("Teléfono"), obtenerPrioridadPorNombre("Alta")]);
    // Ticket recién creado (nuevo, sin tomar) para probar la transición nuevo→abierto.
    const nuevoRes = await request(app)
      .post(`${API}/tickets`)
      .set("Authorization", admin.auth)
      .send({
        asunto: "Otro problema",
        descripcion: "desc",
        solicitanteNombre: "Ana",
        solicitanteEmail: "ana@test.local",
        canalId: canal.id,
        prioridadId: prioridad.id,
      });
    const ticketId = nuevoRes.body.data.id;
    expect(nuevoRes.body.data.estado.nombre).toBe("Nuevo");
    await request(app).post(`${API}/tickets/${ticketId}/tomar`).set("Authorization", admin.auth);

    const res1 = await mensaje(admin.auth, ticketId, { tipo: "respuesta_cliente", cuerpo: "Estamos revisando" });
    expect(res1.status).toBe(201);
    const t1 = await ticket(admin.auth, ticketId);
    expect(t1.estado.nombre).toBe("Abierto");
    expect(t1.primeraRespuestaEn).not.toBeNull();
    const primera = t1.primeraRespuestaEn;

    // Segunda respuesta_cliente: no pisa primera_respuesta_en ni reabre nada raro.
    await new Promise((r) => setTimeout(r, 20));
    const res2 = await mensaje(admin.auth, ticketId, { tipo: "respuesta_cliente", cuerpo: "Seguimos revisando" });
    expect(res2.status).toBe(201);
    const t2 = await ticket(admin.auth, ticketId);
    expect(t2.primeraRespuestaEn).toBe(primera);
    expect(t2.estado.nombre).toBe("Abierto");
    expect(t2.mensajes).toHaveLength(2);
  });

  it("respuesta_cliente en un ticket esperando_cliente o resuelto NO lo reabre: se agrega al hilo sin tocar el estado", async () => {
    const e = await crearEscenarioTicket();
    for (const nombreEstado of ["Esperando cliente", "Resuelto"]) {
      const estado = await obtenerEstadoTicketPorNombre(nombreEstado);
      await request(app).post(`${API}/tickets/${e.ticketId}/estado`).set("Authorization", e.resp.auth).send({ estadoId: estado.id });
      const res = await mensaje(e.resp.auth, e.ticketId, { tipo: "respuesta_cliente", cuerpo: `Actualización para ${nombreEstado}` });
      expect(res.status).toBe(201);
      const t = await ticket(e.resp.auth, e.ticketId);
      expect(t.estado.nombre).toBe(nombreEstado);
    }
  });

  it("tipo 'cliente' es rechazado por Zod: 400", async () => {
    const e = await crearEscenarioTicket();

    const res = await mensaje(e.resp.auth, e.ticketId, { tipo: "cliente", cuerpo: "hola" });

    expect(res.status).toBe(400);
  });

  it("solo el responsable actual, gestion o admin publican mensajes", async () => {
    const e = await crearEscenarioTicket();

    const ajeno = await mensaje(e.ajeno.auth, e.ticketId, { tipo: "nota_interna", cuerpo: "x" });
    const lectura = await mensaje(e.lectura.auth, e.ticketId, { tipo: "nota_interna", cuerpo: "x" });
    const gestion = await mensaje(e.gestion.auth, e.ticketId, { tipo: "nota_interna", cuerpo: "x" });

    expect(ajeno.status).toBe(403);
    expect(lectura.status).toBe(403);
    expect(gestion.status).toBe(201);
  });

  it("adjuntoIds: asocia adjuntos ya subidos sueltos al ticket, re-parentándolos al mensaje", async () => {
    const e = await crearEscenarioTicket();
    const subida = await request(app)
      .post(`${API}/adjuntos`)
      .set("Authorization", e.resp.auth)
      .field("entidadTipo", "ticket")
      .field("entidadId", e.ticketId)
      .attach("archivo", Buffer.from("contenido"), { filename: "nota.txt", contentType: "text/plain" });
    expect(subida.status).toBe(201);
    const adjuntoId = subida.body.data.id;

    const res = await mensaje(e.resp.auth, e.ticketId, { tipo: "nota_interna", cuerpo: "Ver adjunto", adjuntoIds: [adjuntoId] });

    expect(res.status).toBe(201);
    expect(res.body.data.adjuntos).toHaveLength(1);
    expect(res.body.data.adjuntos[0].id).toBe(adjuntoId);

    const t = await ticket(e.resp.auth, e.ticketId);
    // Ya no aparece como adjunto suelto del ticket: se movió al mensaje.
    expect(t.adjuntos).toHaveLength(0);
    expect(t.mensajes[0].adjuntos).toHaveLength(1);

    const fila = await AppDataSource.query(`SELECT entidad_tipo, entidad_id FROM adjunto WHERE id = @0`, [adjuntoId]);
    expect(fila[0].entidad_tipo).toBe("mensaje");
  });

  it("adjuntoIds que no pertenecen al ticket como sueltos: 400 ADJUNTO_INVALIDO", async () => {
    const e = await crearEscenarioTicket();

    const res = await mensaje(e.resp.auth, e.ticketId, {
      tipo: "nota_interna",
      cuerpo: "x",
      adjuntoIds: ["11111111-1111-4111-8111-111111111111"],
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("ADJUNTO_INVALIDO");
  });
});
