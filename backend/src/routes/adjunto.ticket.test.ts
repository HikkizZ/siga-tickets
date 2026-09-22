import { rm } from "node:fs/promises";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { env } from "../config/env.js";
import { conectarBD, limpiarBD } from "../test/helpers.js";
import { API } from "../test/otHelpers.js";
import { crearEscenarioTicket } from "../test/ticketHelpers.js";

beforeAll(conectarBD);
beforeEach(async () => {
  await limpiarBD();
  await rm(env.adjuntosDir, { recursive: true, force: true });
});
afterAll(async () => {
  await rm(env.adjuntosDir, { recursive: true, force: true });
  await AppDataSource.destroy();
});

function subir(auth: string, entidadTipo: string, entidadId: string, nombre = "a.pdf", datos = Buffer.from("%PDF-1.4 x")) {
  return request(app)
    .post(`${API}/adjuntos`)
    .set("Authorization", auth)
    .field("entidadTipo", entidadTipo)
    .field("entidadId", entidadId)
    .attach("archivo", datos, { filename: nombre, contentType: "application/pdf" });
}

describe("POST /adjuntos generalizado (Fase 3): entidadTipo=ticket y entidadTipo=mensaje", () => {
  it("sube a un ticket (suelto) y aparece en el detalle del ticket", async () => {
    const e = await crearEscenarioTicket();

    const res = await subir(e.resp.auth, "ticket", e.ticketId);

    expect(res.status).toBe(201);
    const t = await request(app).get(`${API}/tickets/${e.ticketId}`).set("Authorization", e.resp.auth);
    expect(t.body.data.adjuntos).toHaveLength(1);
    const ev = await AppDataSource.query(`SELECT tipo, entidad_tipo, entidad_id FROM evento WHERE entidad_tipo = 'ticket' AND tipo = 'adjunto_agregado'`);
    expect(ev).toHaveLength(1);
    expect(String(ev[0].entidad_id).toLowerCase()).toBe(e.ticketId);
  });

  it("permisos de subida a un ticket: mismo criterio que editar (responsable actual, gestion, admin)", async () => {
    const e = await crearEscenarioTicket();

    const resp = await subir(e.resp.auth, "ticket", e.ticketId, "1.pdf");
    const ajeno = await subir(e.ajeno.auth, "ticket", e.ticketId, "2.pdf");
    const lectura = await subir(e.lectura.auth, "ticket", e.ticketId, "3.pdf");
    const gestion = await subir(e.gestion.auth, "ticket", e.ticketId, "4.pdf");

    expect(resp.status).toBe(201);
    expect(ajeno.status).toBe(403);
    expect(lectura.status).toBe(403);
    expect(gestion.status).toBe(201);
  });

  it("sube directo a un mensaje ya existente (mismo permiso que publicar mensajes en ese ticket)", async () => {
    const e = await crearEscenarioTicket();
    const mensaje = await request(app)
      .post(`${API}/tickets/${e.ticketId}/mensajes`)
      .set("Authorization", e.resp.auth)
      .send({ tipo: "nota_interna", cuerpo: "hola" });
    const mensajeId = mensaje.body.data.id;

    const propio = await subir(e.resp.auth, "mensaje", mensajeId, "adj.pdf");
    const ajeno = await subir(e.ajeno.auth, "mensaje", mensajeId, "adj2.pdf");

    expect(propio.status).toBe(201);
    expect(ajeno.status).toBe(403);
    const t = await request(app).get(`${API}/tickets/${e.ticketId}`).set("Authorization", e.resp.auth);
    expect(t.body.data.mensajes[0].adjuntos).toHaveLength(1);
  });

  it("adjuntar a un mensaje inexistente: 404 MENSAJE_NO_ENCONTRADO", async () => {
    const e = await crearEscenarioTicket();

    const res = await subir(e.resp.auth, "mensaje", "11111111-1111-4111-8111-111111111111");

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("MENSAJE_NO_ENCONTRADO");
  });

  it("cuota de 25 MB por entidad aplica igual a un ticket", async () => {
    const e = await crearEscenarioTicket();
    const uno = (n: number) => Buffer.alloc(10 * 1024 * 1024, n);

    const a = await subir(e.resp.auth, "ticket", e.ticketId, "a.pdf", uno(1));
    const b = await subir(e.resp.auth, "ticket", e.ticketId, "b.pdf", uno(2));
    const c = await subir(e.resp.auth, "ticket", e.ticketId, "c.pdf", uno(3));

    expect([a.status, b.status]).toEqual([201, 201]);
    expect(c.status).toBe(413);
    expect(c.body.code).toBe("ADJUNTO_CUOTA_EXCEDIDA");
  });

  it("el flujo de adjuntos de OT sigue funcionando igual que antes de la generalización", async () => {
    const e = await crearEscenarioTicket();
    const ot = await request(app)
      .post(`${API}/ots`)
      .set("Authorization", e.admin.auth)
      .send({ titulo: "OT", descripcion: "d", clienteId: e.cliente.id, categoria: "soporte", prioridad: "media", origen: "telefono" });

    const res = await subir(e.admin.auth, "ot", ot.body.data.id);

    expect(res.status).toBe(201);
    const detalle = await request(app).get(`${API}/ots/${ot.body.data.id}`).set("Authorization", e.admin.auth);
    expect(detalle.body.data.adjuntos).toHaveLength(1);
    const ev = await AppDataSource.query(`SELECT 1 FROM evento WHERE entidad_tipo = 'ot' AND tipo = 'adjunto_agregado'`);
    expect(ev).toHaveLength(1);
  });
});
