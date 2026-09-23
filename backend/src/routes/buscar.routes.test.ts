import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { Rol } from "../entities/enums.js";
import { conectarBD, limpiarBD } from "../test/helpers.js";
import { API, cotizacionBody, crearClienteTest, crearOtApi, crearSesionNombrada } from "../test/otHelpers.js";
import { crearTicketApi } from "../test/ticketHelpers.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

const get = (auth: string, url: string) => request(app).get(`${API}${url}`).set("Authorization", auth);
const post = (auth: string, url: string, body: object = {}) => request(app).post(`${API}${url}`).set("Authorization", auth).send(body);

describe("GET /buscar", () => {
  it("encuentra OT por numero o por titulo, y no toca las otras ramas", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_busc1");
    const cliente = await crearClienteTest("Cliente Buscar OT");
    const ot = await crearOtApi(admin.auth, cliente.id, { titulo: "Mantención bomba centrífuga" });

    const porNumero = await get(admin.auth, `/buscar?q=${encodeURIComponent(ot.numero)}`);
    expect(porNumero.body.data.ots).toEqual([{ tipo: "ot", id: ot.id, numero: ot.numero, titulo: "Mantención bomba centrífuga", estado: "ingresado" }]);
    expect(porNumero.body.data.tickets).toEqual([]);
    expect(porNumero.body.data.cotizaciones).toEqual([]);
    expect(porNumero.body.data.clientes).toEqual([]);

    const porTitulo = await get(admin.auth, `/buscar?q=${encodeURIComponent("centrífuga")}`);
    expect(porTitulo.body.data.ots.map((o: { id: string }) => o.id)).toContain(ot.id);
  });

  it("encuentra ticket por numero o por asunto", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_busc2");
    const t = await crearTicketApi(admin.auth, { asunto: "Impresora no responde" });

    const porNumero = await get(admin.auth, `/buscar?q=${encodeURIComponent(t.numero)}`);
    expect(porNumero.body.data.tickets).toEqual([{ tipo: "ticket", id: t.id, numero: t.numero, asunto: "Impresora no responde", estado: "nuevo" }]);

    const porAsunto = await get(admin.auth, `/buscar?q=${encodeURIComponent("impresora")}`);
    expect(porAsunto.body.data.tickets.map((x: { id: string }) => x.id)).toContain(t.id);
  });

  it("encuentra cotización por numero", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_busc1");
    const cliente = await crearClienteTest("Cliente Buscar Cot");
    const c = await post(gestion.auth, "/cotizaciones", cotizacionBody({ clienteId: cliente.id, montoClp: 12345 }));

    const res = await get(gestion.auth, `/buscar?q=${encodeURIComponent(c.body.data.numero)}`);
    expect(res.body.data.cotizaciones).toEqual([
      { tipo: "cotizacion", id: c.body.data.id, numero: c.body.data.numero, estado: "borrador", montoClp: 12345 },
    ]);
  });

  it("encuentra cliente por nombre", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_busc3");
    const cliente = await crearClienteTest("Minera Los Andes Buscar");

    const res = await get(admin.auth, `/buscar?q=${encodeURIComponent("Los Andes Buscar")}`);
    expect(res.body.data.clientes).toEqual([{ tipo: "cliente", id: cliente.id, nombre: "Minera Los Andes Buscar" }]);
  });

  it("respeta el límite de 5 resultados por rama", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_busc4");
    const cliente = await crearClienteTest("Cliente Buscar Limite");
    for (let i = 0; i < 6; i++) {
      await crearOtApi(admin.auth, cliente.id, { titulo: `OT límite ${i}` });
    }

    const res = await get(admin.auth, `/buscar?q=${encodeURIComponent("límite")}`);
    expect(res.body.data.ots).toHaveLength(5);
  });

  it("q con % y _ literales no rompe la búsqueda (mismo caso que los filtros q existentes de OT)", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_busc5");
    const cliente = await crearClienteTest("Cliente Buscar Escape");
    const ot = await crearOtApi(admin.auth, cliente.id, { titulo: "Ventilador 100% listo" });

    const conPorcentaje = await get(admin.auth, `/buscar?q=${encodeURIComponent("100%")}`);
    expect(conPorcentaje.body.data.ots.map((o: { id: string }) => o.id)).toEqual([ot.id]);

    const sinCoincidencia = await get(admin.auth, `/buscar?q=${encodeURIComponent("xyz%zzz")}`);
    expect(sinCoincidencia.body.data.ots).toEqual([]);
  });

  it("q vacío o ausente: 400 VALIDATION_ERROR", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_busc6");
    const sinQ = await get(admin.auth, "/buscar");
    expect(sinQ.status).toBe(400);
    const vacio = await get(admin.auth, "/buscar?q=");
    expect(vacio.status).toBe(400);
  });

  it("RBAC: lectura puede buscar; sin token 401", async () => {
    const lectura = await crearSesionNombrada(Rol.LECTURA, "lectura_busc");
    const ok = await get(lectura.auth, "/buscar?q=algo");
    expect(ok.status).toBe(200);

    const sinToken = await request(app).get(`${API}/buscar?q=algo`);
    expect(sinToken.status).toBe(401);
  });
});
