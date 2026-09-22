import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { conectarBD, limpiarBD } from "../test/helpers.js";
import { API, otBody } from "../test/otHelpers.js";
import { crearEscenarioTicket, crearTicketApi } from "../test/ticketHelpers.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

describe("GET /ots/:id — campo tickets (Fase 3)", () => {
  it("está vacío cuando no hay tickets vinculados", async () => {
    const e = await crearEscenarioTicket();
    const ot = await request(app).post(`${API}/ots`).set("Authorization", e.admin.auth).send(otBody(e.cliente.id));

    const res = await request(app).get(`${API}/ots/${ot.body.data.id}`).set("Authorization", e.admin.auth);

    expect(res.body.data.tickets).toEqual([]);
  });

  it("muestra el ticket de origen primero, luego los vinculados manualmente, con su forma completa", async () => {
    const e = await crearEscenarioTicket();
    const convertida = await request(app)
      .post(`${API}/tickets/${e.ticketId}/convertir-a-ot`)
      .set("Authorization", e.gestion.auth)
      .send({ categoria: "soporte", clienteId: e.cliente.id });
    const otId = convertida.body.data.id;
    const otroTicket = await crearTicketApi(e.admin.auth, { asunto: "Ticket vinculado manual" });
    await request(app).post(`${API}/tickets/${otroTicket.id}/ots`).set("Authorization", e.gestion.auth).send({ otId });

    const res = await request(app).get(`${API}/ots/${otId}`).set("Authorization", e.admin.auth);

    expect(res.body.data.tickets).toHaveLength(2);
    expect(res.body.data.tickets[0]).toMatchObject({ id: e.ticketId, numero: e.numero, esOrigen: true, canal: "telefono" });
    expect(res.body.data.tickets[1]).toMatchObject({ id: otroTicket.id, asunto: "Ticket vinculado manual", esOrigen: false });
  });
});
