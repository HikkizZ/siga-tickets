import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { conectarBD, limpiarBD } from "../test/helpers.js";
import { API } from "../test/otHelpers.js";
import { crearEscenarioTicket } from "../test/ticketHelpers.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

const cambiarEstado = (auth: string, id: string, estado: string) =>
  request(app).post(`${API}/tickets/${id}/estado`).set("Authorization", auth).send({ estado });

describe("POST /tickets/:id/estado", () => {
  it("cambia el estado y registra evento estado_cambiado", async () => {
    // crearEscenarioTicket solo lo TOMA (responsable); tomar no cambia el estado: sigue "nuevo"
    // hasta la primera respuesta_cliente (ver ticket.mensaje.service.ts).
    const e = await crearEscenarioTicket();

    const res = await cambiarEstado(e.resp.auth, e.ticketId, "esperando_cliente");

    expect(res.status).toBe(200);
    expect(res.body.data.estado).toBe("esperando_cliente");
    const ev = res.body.data.eventos;
    expect(ev[0]).toMatchObject({ tipo: "estado_cambiado", payload: { de: "nuevo", a: "esperando_cliente" } });
  });

  it("mismo estado: 409 ESTADO_SIN_CAMBIO", async () => {
    const e = await crearEscenarioTicket();

    const res = await cambiarEstado(e.resp.auth, e.ticketId, "nuevo");

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ESTADO_SIN_CAMBIO");
  });

  it("resuelto_en y cerrado_en se fijan una sola vez, aunque el ticket vuelva a pasar por ese estado", async () => {
    const e = await crearEscenarioTicket();

    const r1 = await cambiarEstado(e.resp.auth, e.ticketId, "resuelto");
    const resueltoEn1 = r1.body.data.resueltoEn;
    expect(resueltoEn1).not.toBeNull();

    await cambiarEstado(e.resp.auth, e.ticketId, "abierto"); // se reabre manualmente
    await new Promise((r) => setTimeout(r, 20));
    const r2 = await cambiarEstado(e.resp.auth, e.ticketId, "resuelto");
    expect(r2.body.data.resueltoEn).toBe(resueltoEn1); // no se pisó

    const r3 = await cambiarEstado(e.resp.auth, e.ticketId, "cerrado");
    expect(r3.body.data.cerradoEn).not.toBeNull();
    await cambiarEstado(e.resp.auth, e.ticketId, "abierto");
    const cerradoEn1 = r3.body.data.cerradoEn;
    await new Promise((r) => setTimeout(r, 20));
    const r4 = await cambiarEstado(e.resp.auth, e.ticketId, "cerrado");
    expect(r4.body.data.cerradoEn).toBe(cerradoEn1);
  });

  it("cualquiera de los 5 estados es válido como destino (sin máquina de transiciones estricta)", async () => {
    const e = await crearEscenarioTicket();
    // Arranca en "nuevo": cada paso siguiente es distinto del anterior.
    for (const estado of ["abierto", "esperando_cliente", "resuelto", "cerrado", "nuevo"]) {
      const res = await cambiarEstado(e.resp.auth, e.ticketId, estado);
      expect(res.status, estado).toBe(200);
    }
  });

  it("solo el responsable actual, gestion o admin cambian el estado", async () => {
    const e = await crearEscenarioTicket();

    const ajeno = await cambiarEstado(e.ajeno.auth, e.ticketId, "resuelto");
    const lectura = await cambiarEstado(e.lectura.auth, e.ticketId, "resuelto");
    const gestion = await cambiarEstado(e.gestion.auth, e.ticketId, "resuelto");

    expect(ajeno.status).toBe(403);
    expect(lectura.status).toBe(403);
    expect(gestion.status).toBe(200);
  });

  it("ticket inexistente: 404", async () => {
    const e = await crearEscenarioTicket();

    const res = await cambiarEstado(e.admin.auth, "11111111-1111-4111-8111-111111111111", "resuelto");

    expect(res.status).toBe(404);
  });
});
