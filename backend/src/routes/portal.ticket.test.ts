import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { Rol } from "../entities/enums.js";
import { conectarBD, crearUsuarioSistemaTest, limpiarBD } from "../test/helpers.js";
import { API, crearClienteTest, crearOtApi, crearSesionNombrada } from "../test/otHelpers.js";
import { crearTicketPublicoApi, PORTAL, tokenPortalTest } from "../test/portalHelpers.js";

beforeAll(conectarBD);
beforeEach(async () => {
  await limpiarBD();
  await crearUsuarioSistemaTest();
});
afterAll(async () => {
  await AppDataSource.destroy();
});

async function idDelTicket(numero: string): Promise<string> {
  const [{ id }] = await AppDataSource.query(`SELECT id FROM ticket WHERE numero = @0`, [numero]);
  return (id as string).toLowerCase();
}

describe("GET /publico/ticket", () => {
  it("forma exacta del DTO: solo los campos previstos, nunca de más", async () => {
    const { numero } = await crearTicketPublicoApi();
    const ticketId = await idDelTicket(numero);

    const res = await request(app).get(`${PORTAL}/ticket`).set("Authorization", tokenPortalTest(ticketId));

    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data).sort()).toEqual(["asunto", "descripcion", "estado", "fechaIngreso", "mensajes", "numero", "ot"].sort());
    expect(res.body.data.numero).toBe(numero);
    expect(res.body.data.estado).toBe("nuevo");
    expect(res.body.data.ot).toBeNull();
    expect(res.body.data.mensajes).toEqual([]);
  });

  it("el hilo excluye nota_interna pero incluye respuesta_cliente y el mensaje del propio cliente", async () => {
    const tecnico = await crearSesionNombrada(Rol.TECNICO, "tecnico_portal");
    const { numero } = await crearTicketPublicoApi();
    const ticketId = await idDelTicket(numero);

    await request(app).post(`${API}/tickets/${ticketId}/tomar`).set("Authorization", tecnico.auth);
    await request(app)
      .post(`${API}/tickets/${ticketId}/mensajes`)
      .set("Authorization", tecnico.auth)
      .send({ tipo: "nota_interna", cuerpo: "nota solo para el equipo" });
    await request(app)
      .post(`${API}/tickets/${ticketId}/mensajes`)
      .set("Authorization", tecnico.auth)
      .send({ tipo: "respuesta_cliente", cuerpo: "estamos revisando tu solicitud" });
    await request(app)
      .post(`${PORTAL}/ticket/mensajes`)
      .set("Authorization", tokenPortalTest(ticketId))
      .field("cuerpo", "gracias, quedo atento");

    const res = await request(app).get(`${PORTAL}/ticket`).set("Authorization", tokenPortalTest(ticketId));

    const cuerpos = (res.body.data.mensajes as Array<{ cuerpo: string; tipo: string }>).map((m) => m.cuerpo);
    expect(cuerpos).toEqual(["estamos revisando tu solicitud", "gracias, quedo atento"]);
    expect(cuerpos).not.toContain("nota solo para el equipo");
    expect(JSON.stringify(res.body)).not.toContain("nota solo para el equipo");
  });

  it("nunca mezcla datos de otro ticket", async () => {
    const a = await crearTicketPublicoApi({ asunto: "Ticket A", correo: "a@cliente.cl" });
    const b = await crearTicketPublicoApi({ asunto: "Ticket B", correo: "b@cliente.cl" });
    const idA = await idDelTicket(a.numero);

    const res = await request(app).get(`${PORTAL}/ticket`).set("Authorization", tokenPortalTest(idA));

    expect(res.body.data.numero).toBe(a.numero);
    expect(res.body.data.numero).not.toBe(b.numero);
    expect(res.body.data.asunto).toBe("Ticket A");
  });

  it("si el ticket tiene una OT vinculada: tarjeta reducida sin horas/montos/cotizaciones", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_ot_portal");
    const resp = await crearSesionNombrada(Rol.TECNICO, "resp_ot_portal");
    const cliente = await crearClienteTest("Cliente Portal Test");
    const ot = await crearOtApi(gestion.auth, cliente.id, { responsableId: resp.usuario.id, fechaEstimadaTermino: "2026-12-01" });
    const { numero } = await crearTicketPublicoApi();
    const ticketId = await idDelTicket(numero);

    const vinculo = await request(app).post(`${API}/tickets/${ticketId}/ots`).set("Authorization", gestion.auth).send({ otId: ot.id });
    expect(vinculo.status).toBe(201);

    const res = await request(app).get(`${PORTAL}/ticket`).set("Authorization", tokenPortalTest(ticketId));

    expect(res.body.data.ot).toEqual({ estado: "ingresado", fechaEstimadaTermino: "2026-12-01", responsableNombre: resp.usuario.nombre });
    expect(JSON.stringify(res.body.data.ot)).not.toMatch(/monto|hora|cotizacion/i);
  });
});
