import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { conectarBD, limpiarBD, obtenerEstadoTicketPorNombre } from "../test/helpers.js";
import { API } from "../test/otHelpers.js";
import { crearEscenarioTicket } from "../test/ticketHelpers.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

// Fase C: estado ya no es un valor de enum fijo ("nuevo"/"abierto"/...) sino un catálogo con uuid;
// se resuelve por nombre (mismas filas sembradas por la migración, ver test/helpers.ts::limpiarBD).
const cambiarEstado = async (auth: string, id: string, nombreEstado: string) => {
  const estado = await obtenerEstadoTicketPorNombre(nombreEstado);
  return request(app).post(`${API}/tickets/${id}/estado`).set("Authorization", auth).send({ estadoId: estado.id });
};

describe("POST /tickets/:id/estado", () => {
  it("cambia el estado y registra evento estado_cambiado", async () => {
    // crearEscenarioTicket solo lo TOMA (responsable); tomar no cambia el estado: sigue "Nuevo"
    // hasta la primera respuesta_cliente (ver ticket.mensaje.service.ts).
    const e = await crearEscenarioTicket();

    const res = await cambiarEstado(e.resp.auth, e.ticketId, "Esperando cliente");

    expect(res.status).toBe(200);
    expect(res.body.data.estado.nombre).toBe("Esperando cliente");
    const ev = res.body.data.eventos;
    expect(ev[0]).toMatchObject({ tipo: "estado_cambiado", payload: { de: "Nuevo", a: "Esperando cliente" } });
  });

  it("mismo estado: 409 ESTADO_SIN_CAMBIO", async () => {
    const e = await crearEscenarioTicket();

    const res = await cambiarEstado(e.resp.auth, e.ticketId, "Nuevo");

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ESTADO_SIN_CAMBIO");
  });

  it("resuelto_en y cerrado_en se fijan una sola vez, aunque el ticket vuelva a pasar por ese estado", async () => {
    const e = await crearEscenarioTicket();

    const r1 = await cambiarEstado(e.resp.auth, e.ticketId, "Resuelto");
    const resueltoEn1 = r1.body.data.resueltoEn;
    expect(resueltoEn1).not.toBeNull();

    await cambiarEstado(e.resp.auth, e.ticketId, "Abierto"); // se reabre manualmente
    await new Promise((r) => setTimeout(r, 20));
    const r2 = await cambiarEstado(e.resp.auth, e.ticketId, "Resuelto");
    expect(r2.body.data.resueltoEn).toBe(resueltoEn1); // no se pisó

    const r3 = await cambiarEstado(e.resp.auth, e.ticketId, "Cerrado");
    expect(r3.body.data.cerradoEn).not.toBeNull();
    await cambiarEstado(e.resp.auth, e.ticketId, "Abierto");
    const cerradoEn1 = r3.body.data.cerradoEn;
    await new Promise((r) => setTimeout(r, 20));
    const r4 = await cambiarEstado(e.resp.auth, e.ticketId, "Cerrado");
    expect(r4.body.data.cerradoEn).toBe(cerradoEn1);
  });

  it("cualquiera de los 5 estados es válido como destino (sin máquina de transiciones estricta)", async () => {
    const e = await crearEscenarioTicket();
    // Arranca en "Nuevo": cada paso siguiente es distinto del anterior.
    for (const estado of ["Abierto", "Esperando cliente", "Resuelto", "Cerrado", "Nuevo"]) {
      const res = await cambiarEstado(e.resp.auth, e.ticketId, estado);
      expect(res.status, estado).toBe(200);
    }
  });

  it("solo el responsable actual, gestion o admin cambian el estado", async () => {
    const e = await crearEscenarioTicket();

    const ajeno = await cambiarEstado(e.ajeno.auth, e.ticketId, "Resuelto");
    const lectura = await cambiarEstado(e.lectura.auth, e.ticketId, "Resuelto");
    const gestion = await cambiarEstado(e.gestion.auth, e.ticketId, "Resuelto");

    expect(ajeno.status).toBe(403);
    expect(lectura.status).toBe(403);
    expect(gestion.status).toBe(200);
  });

  it("ticket inexistente: 404", async () => {
    const e = await crearEscenarioTicket();

    const res = await cambiarEstado(e.admin.auth, "11111111-1111-4111-8111-111111111111", "Resuelto");

    expect(res.status).toBe(404);
  });
});
