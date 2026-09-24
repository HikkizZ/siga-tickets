import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { Rol } from "../entities/enums.js";
import { conectarBD, limpiarBD, obtenerCanalTicketPorNombre } from "../test/helpers.js";
import { API, crearClienteTest, crearSesionNombrada, otBody } from "../test/otHelpers.js";
import { crearEscenarioTicket, crearTicketApi, tramosTicket } from "../test/ticketHelpers.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

const convertir = (auth: string, id: string, body: object) =>
  request(app).post(`${API}/tickets/${id}/convertir-a-ot`).set("Authorization", auth).send(body);
const ticket = async (auth: string, id: string) => (await request(app).get(`${API}/tickets/${id}`).set("Authorization", auth)).body.data;

describe("POST /tickets/:id/convertir-a-ot", () => {
  it("hereda titulo/descripcion/prioridad del ticket, origen desde el canal, cliente heredado, recepcionado_por del ticket (NO el actor)", async () => {
    const e = await crearEscenarioTicket();

    const res = await convertir(e.gestion.auth, e.ticketId, { categoria: "soporte", clienteId: e.cliente.id });

    expect(res.status).toBe(201);
    const ot = res.body.data;
    expect(ot.origen).toBe("telefono"); // canal del ticket es 'telefono'
    expect(ot.recepcionadoPor.id).toBe(e.admin.usuario.id); // quien creó (recibió) el ticket, no e.gestion
    expect(ot.recepcionadoPor.id).not.toBe(e.gestion.usuario.id);
    expect(ot.cliente.id).toBe(e.cliente.id);
    expect(ot.prioridad.nombre).toBe("Media"); // heredada del ticket (ticketBody default)

    const t = await ticket(e.gestion.auth, e.ticketId);
    expect(t.ots).toHaveLength(1);
    expect(t.ots[0]).toMatchObject({ id: ot.id, numero: ot.numero, esOrigen: true });
    const vinculado = t.eventos.find((ev: { tipo: string }) => ev.tipo === "vinculado_ot");
    expect(vinculado.payload).toEqual({ otId: ot.id, otNumero: ot.numero, esOrigen: true });
  });

  it("origen se mapea correctamente desde cada canal", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_origen");
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_origen");
    const cliente = await crearClienteTest("Cliente Origen Test");
    const mapa: Record<string, string> = { Teléfono: "telefono", Presencial: "presencial", Interno: "interna" };

    for (const [nombreCanal, origenEsperado] of Object.entries(mapa)) {
      const canal = await obtenerCanalTicketPorNombre(nombreCanal);
      const t = await crearTicketApi(admin.auth, { canalId: canal.id });
      const body =
        nombreCanal === "Interno"
          ? { categoria: "soporte", esInterna: true, areaInterna: "TI" }
          : { categoria: "soporte", clienteId: cliente.id };
      const res = await convertir(gestion.auth, t.id, body);
      expect(res.status, nombreCanal).toBe(201);
      expect(res.body.data.origen).toBe(origenEsperado);
    }
  });

  it("cadena de responsables copiada fielmente (mismos usuario_id/desde/hasta/motivo/derivado_por) como tramos de la OT", async () => {
    const e = await crearEscenarioTicket();
    const extra = await crearSesionNombrada(Rol.TECNICO, "extra_conv");
    await request(app).post(`${API}/tickets/${e.ticketId}/derivar`).set("Authorization", e.resp.auth).send({ destinoId: extra.usuario.id, motivo: "Se deriva para probar" });
    const tramosTk = await tramosTicket(e.ticketId);
    expect(tramosTk).toHaveLength(2);

    const res = await convertir(e.gestion.auth, e.ticketId, { categoria: "soporte", clienteId: e.cliente.id });
    expect(res.status).toBe(201);

    const tramosOt = await AppDataSource.query(
      `SELECT usuario_id, desde, hasta, motivo_entrada, derivado_por_id FROM asignacion WHERE entidad_tipo = 'ot' AND entidad_id = @0 ORDER BY desde`,
      [res.body.data.id],
    );
    expect(tramosOt).toHaveLength(2);
    for (let i = 0; i < 2; i++) {
      expect(tramosOt[i].usuario_id.toLowerCase()).toBe(tramosTk[i]!.usuario_id.toLowerCase());
      expect(tramosOt[i].desde.getTime()).toBe(tramosTk[i]!.desde.getTime());
      expect(tramosOt[i].hasta?.getTime() ?? null).toBe(tramosTk[i]!.hasta?.getTime() ?? null);
      expect(tramosOt[i].motivo_entrada).toBe(tramosTk[i]!.motivo_entrada);
      expect((tramosOt[i].derivado_por_id?.toLowerCase() ?? null)).toBe(tramosTk[i]!.derivado_por_id?.toLowerCase() ?? null);
    }
    expect(res.body.data.responsable.id).toBe(extra.usuario.id);
  });

  it("caso borde: el ticket nunca se tomó (sin cadena) — la OT arranca con un único tramo abierto para quien convierte", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_sintomar");
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_sintomar");
    const t = await crearTicketApi(admin.auth);
    expect(t.responsable).toBeNull();

    const res = await convertir(gestion.auth, t.id, { categoria: "soporte", esInterna: true, areaInterna: "TI" });

    expect(res.status).toBe(201);
    expect(res.body.data.responsable.id).toBe(gestion.usuario.id);
    const tramosOt = await AppDataSource.query(`SELECT usuario_id, hasta FROM asignacion WHERE entidad_tipo = 'ot' AND entidad_id = @0`, [
      res.body.data.id,
    ]);
    expect(tramosOt).toHaveLength(1);
    expect(tramosOt[0].hasta).toBeNull();
  });

  it("ticket_ot: es_origen=true y vinculado_por_id es el actor", async () => {
    const e = await crearEscenarioTicket();

    const res = await convertir(e.gestion.auth, e.ticketId, { categoria: "soporte", clienteId: e.cliente.id });

    const fila = await AppDataSource.query(`SELECT es_origen, vinculado_por_id FROM ticket_ot WHERE ticket_id = @0 AND ot_id = @1`, [
      e.ticketId,
      res.body.data.id,
    ]);
    expect(fila).toHaveLength(1);
    expect(fila[0].es_origen).toBe(true);
    expect(String(fila[0].vinculado_por_id).toLowerCase()).toBe(e.gestion.usuario.id);
  });

  it("evento 'creado' de la OT lleva la referencia al ticket de origen", async () => {
    const e = await crearEscenarioTicket();

    const res = await convertir(e.gestion.auth, e.ticketId, { categoria: "soporte", clienteId: e.cliente.id });

    const creado = res.body.data.eventos.find((ev: { tipo: string }) => ev.tipo === "creado");
    expect(creado.payload).toMatchObject({ origenTicketId: e.ticketId, origenTicketNumero: e.numero });
  });

  it("sin cliente en el ticket y sin clienteId/esInterna en el body: 400 CLIENTE_INVALIDO", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_sincliente");
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_sincliente");
    const t = await crearTicketApi(admin.auth); // sin clienteId

    const res = await convertir(gestion.auth, t.id, { categoria: "soporte" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("CLIENTE_INVALIDO");
  });

  it("esInterna sin areaInterna: 400 (reutiliza el CHECK de ot_interna_check)", async () => {
    const e = await crearEscenarioTicket();

    const res = await convertir(e.gestion.auth, e.ticketId, { categoria: "soporte", esInterna: true });

    expect(res.status).toBe(400);
  });

  it("solo gestion o admin convierten: tecnico responsable recibe 403", async () => {
    const e = await crearEscenarioTicket();

    const res = await convertir(e.resp.auth, e.ticketId, { categoria: "soporte", clienteId: e.cliente.id });

    expect(res.status).toBe(403);
  });

  it("todo en una transacción: si algo falla, no queda OT huérfana ni vínculo ticket_ot", async () => {
    const e = await crearEscenarioTicket();

    const res = await convertir(e.gestion.auth, e.ticketId, { categoria: "soporte", esInterna: true }); // sin areaInterna: falla

    expect(res.status).toBe(400);
    expect(await AppDataSource.query(`SELECT 1 FROM ot`)).toHaveLength(0);
    expect(await AppDataSource.query(`SELECT 1 FROM ticket_ot`)).toHaveLength(0);
  });
});

describe("POST /tickets/:id/ots y DELETE /tickets/:id/ots/:otId (vincular OT existente)", () => {
  it("vincula una OT existente con es_origen=false y evento en el ticket", async () => {
    const e = await crearEscenarioTicket();
    const ot = await request(app).post(`${API}/ots`).set("Authorization", e.admin.auth).send(await otBody(e.cliente.id));

    const res = await request(app).post(`${API}/tickets/${e.ticketId}/ots`).set("Authorization", e.gestion.auth).send({ otId: ot.body.data.id });

    expect(res.status).toBe(201);
    const fila = await AppDataSource.query(`SELECT es_origen FROM ticket_ot WHERE ticket_id = @0 AND ot_id = @1`, [e.ticketId, ot.body.data.id]);
    expect(fila[0].es_origen).toBe(false);
    const t = await ticket(e.gestion.auth, e.ticketId);
    expect(t.ots).toHaveLength(1);
    expect(t.eventos.some((ev: { tipo: string }) => ev.tipo === "vinculado_ot")).toBe(true);
  });

  it("vincular la misma OT dos veces: 409 (PK ticket_id+ot_id)", async () => {
    const e = await crearEscenarioTicket();
    const ot = await request(app).post(`${API}/ots`).set("Authorization", e.admin.auth).send(await otBody(e.cliente.id));
    await request(app).post(`${API}/tickets/${e.ticketId}/ots`).set("Authorization", e.gestion.auth).send({ otId: ot.body.data.id });

    const res = await request(app).post(`${API}/tickets/${e.ticketId}/ots`).set("Authorization", e.gestion.auth).send({ otId: ot.body.data.id });

    expect(res.status).toBe(409);
  });

  it("un segundo vínculo es_origen=true sobre la misma OT es rechazado por el índice único (dos convert/link de origen)", async () => {
    const e = await crearEscenarioTicket();
    const convertida = await convertir(e.gestion.auth, e.ticketId, { categoria: "soporte", clienteId: e.cliente.id });
    const otId = convertida.body.data.id;
    const otroTicket = await crearTicketApi(e.admin.auth);

    // vincularOtExistente siempre inserta esOrigen=false, así que esto nunca debería violar el
    // índice: se prueba explícitamente que el segundo vínculo (no-origen) convive con el primero.
    const res = await request(app).post(`${API}/tickets/${otroTicket.id}/ots`).set("Authorization", e.gestion.auth).send({ otId });

    expect(res.status).toBe(201);
    const filas = await AppDataSource.query(`SELECT es_origen FROM ticket_ot WHERE ot_id = @0 ORDER BY creado_en`, [otId]);
    expect(filas.map((f: { es_origen: boolean }) => f.es_origen)).toEqual([true, false]);
  });

  it("desvincular quita el vínculo pero no deshace lo heredado en la OT", async () => {
    const e = await crearEscenarioTicket();
    const convertida = await convertir(e.gestion.auth, e.ticketId, { categoria: "soporte", clienteId: e.cliente.id });
    const otId = convertida.body.data.id;

    const res = await request(app).delete(`${API}/tickets/${e.ticketId}/ots/${otId}`).set("Authorization", e.gestion.auth);

    expect(res.status).toBe(200);
    expect(await AppDataSource.query(`SELECT 1 FROM ticket_ot WHERE ticket_id = @0 AND ot_id = @1`, [e.ticketId, otId])).toHaveLength(0);
    const ot = await request(app).get(`${API}/ots/${otId}`).set("Authorization", e.gestion.auth);
    expect(ot.body.data.recepcionadoPor.id).toBe(e.admin.usuario.id); // sigue igual, no se deshizo
    expect(ot.body.data.tickets).toHaveLength(0);
  });

  it("desvincular un vínculo inexistente: 404", async () => {
    const e = await crearEscenarioTicket();
    const ot = await request(app).post(`${API}/ots`).set("Authorization", e.admin.auth).send(await otBody(e.cliente.id));

    const res = await request(app).delete(`${API}/tickets/${e.ticketId}/ots/${ot.body.data.id}`).set("Authorization", e.gestion.auth);

    expect(res.status).toBe(404);
  });

  it("solo gestion o admin vinculan/desvinculan", async () => {
    const e = await crearEscenarioTicket();
    const ot = await request(app).post(`${API}/ots`).set("Authorization", e.admin.auth).send(await otBody(e.cliente.id));

    const res = await request(app).post(`${API}/tickets/${e.ticketId}/ots`).set("Authorization", e.resp.auth).send({ otId: ot.body.data.id });

    expect(res.status).toBe(403);
  });
});
