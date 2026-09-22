import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { Rol } from "../entities/enums.js";
import { conectarBD, crearUsuarioSistemaTest, limpiarBD } from "../test/helpers.js";
import { API, crearSesionNombrada } from "../test/otHelpers.js";
import { crearTicketPublicoApi, PORTAL, tokenPortalTest } from "../test/portalHelpers.js";

beforeAll(conectarBD);
beforeEach(async () => {
  await limpiarBD();
  await crearUsuarioSistemaTest();
});
afterAll(async () => {
  await AppDataSource.destroy();
});

async function ticketPortal() {
  const { numero } = await crearTicketPublicoApi();
  const [fila] = await AppDataSource.query(`SELECT id FROM ticket WHERE numero = @0`, [numero]);
  const ticketId = (fila.id as string).toLowerCase();
  return { numero, ticketId, auth: tokenPortalTest(ticketId) };
}

function mensajePortal(auth: string, cuerpo: string) {
  return request(app).post(`${PORTAL}/ticket/mensajes`).set("Authorization", auth).field("cuerpo", cuerpo);
}

describe("POST /publico/ticket/mensajes", () => {
  it("crea un mensaje tipo cliente, autor_id NULL y autor_externo = correo del ticket", async () => {
    const t = await ticketPortal();

    const res = await mensajePortal(t.auth, "Tengo una duda adicional");

    expect(res.status).toBe(201);
    const [fila] = await AppDataSource.query(`SELECT tipo, autor_id, autor_externo, cuerpo FROM mensaje_ticket WHERE ticket_id = @0`, [t.ticketId]);
    expect(fila.tipo).toBe("cliente");
    expect(fila.autor_id).toBeNull();
    expect(fila.autor_externo).toBe("juan.perez@cliente.cl");
    expect(fila.cuerpo).toBe("Tengo una duda adicional");
  });

  it("reabre esperando_cliente -> abierto y cierra la pausa de SLA activa", async () => {
    const tecnico = await crearSesionNombrada(Rol.TECNICO, "tecnico_reabre_1");
    const t = await ticketPortal();
    await request(app).post(`${API}/tickets/${t.ticketId}/tomar`).set("Authorization", tecnico.auth);
    const paso = await request(app).post(`${API}/tickets/${t.ticketId}/estado`).set("Authorization", tecnico.auth).send({ estado: "esperando_cliente" });
    expect(paso.status).toBe(200);
    const [pausaAbierta] = await AppDataSource.query(
      `SELECT hasta FROM sla_pausa WHERE entidad_tipo = 'ticket' AND entidad_id = @0`,
      [t.ticketId],
    );
    expect(pausaAbierta.hasta).toBeNull();

    const res = await mensajePortal(t.auth, "ya lo revisé");

    expect(res.status).toBe(201);
    const [fila] = await AppDataSource.query(`SELECT estado FROM ticket WHERE id = @0`, [t.ticketId]);
    expect(fila.estado).toBe("abierto");
    const [pausaCerrada] = await AppDataSource.query(`SELECT hasta FROM sla_pausa WHERE entidad_tipo = 'ticket' AND entidad_id = @0`, [t.ticketId]);
    expect(pausaCerrada.hasta).not.toBeNull();
  });

  it("reabre resuelto -> abierto", async () => {
    const tecnico = await crearSesionNombrada(Rol.TECNICO, "tecnico_reabre_2");
    const t = await ticketPortal();
    await request(app).post(`${API}/tickets/${t.ticketId}/tomar`).set("Authorization", tecnico.auth);
    await request(app).post(`${API}/tickets/${t.ticketId}/estado`).set("Authorization", tecnico.auth).send({ estado: "resuelto" });

    const res = await mensajePortal(t.auth, "sigue fallando");

    expect(res.status).toBe(201);
    const [fila] = await AppDataSource.query(`SELECT estado FROM ticket WHERE id = @0`, [t.ticketId]);
    expect(fila.estado).toBe("abierto");
  });

  it("NO reabre un ticket cerrado", async () => {
    const tecnico = await crearSesionNombrada(Rol.TECNICO, "tecnico_no_reabre");
    const t = await ticketPortal();
    await request(app).post(`${API}/tickets/${t.ticketId}/tomar`).set("Authorization", tecnico.auth);
    await request(app).post(`${API}/tickets/${t.ticketId}/estado`).set("Authorization", tecnico.auth).send({ estado: "cerrado" });

    const res = await mensajePortal(t.auth, "¿siguen ahí?");

    expect(res.status).toBe(201);
    const [fila] = await AppDataSource.query(`SELECT estado FROM ticket WHERE id = @0`, [t.ticketId]);
    expect(fila.estado).toBe("cerrado");
  });

  it("cuerpo vacío: 400", async () => {
    const t = await ticketPortal();
    const res = await mensajePortal(t.auth, "");
    expect(res.status).toBe(400);
  });

  it("sin token de portal: 401", async () => {
    const res = await request(app).post(`${PORTAL}/ticket/mensajes`).field("cuerpo", "hola");
    expect(res.status).toBe(401);
  });
});
