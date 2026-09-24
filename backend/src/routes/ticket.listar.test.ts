import { DateTime } from "luxon";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { Rol } from "../entities/enums.js";
import { conectarBD, limpiarBD, obtenerCanalTicketPorNombre, obtenerPrioridadPorNombre } from "../test/helpers.js";
import { API, crearSesionNombrada } from "../test/otHelpers.js";
import { crearTicketApi } from "../test/ticketHelpers.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

describe("GET /tickets", () => {
  it("pagina y devuelve meta.total", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_listar");
    for (let i = 0; i < 3; i++) await crearTicketApi(admin.auth, { asunto: `Caso ${i}` });

    const res = await request(app).get(`${API}/tickets?perPage=2&page=1`).set("Authorization", admin.auth);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toEqual({ page: 1, perPage: 2, total: 3 });
  });

  it("filtra por estado, prioridad, canal", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_filtros");
    const [alta, baja, presencial, telefono] = await Promise.all([
      obtenerPrioridadPorNombre("Alta"),
      obtenerPrioridadPorNombre("Baja"),
      obtenerCanalTicketPorNombre("Presencial"),
      obtenerCanalTicketPorNombre("Teléfono"),
    ]);
    await crearTicketApi(admin.auth, { prioridadId: alta.id, canalId: presencial.id });
    await crearTicketApi(admin.auth, { prioridadId: baja.id, canalId: telefono.id });

    const res = await request(app)
      .get(`${API}/tickets?prioridadId=${alta.id}&canalId=${presencial.id}`)
      .set("Authorization", admin.auth);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].prioridad).toEqual({ id: alta.id, nombre: "Alta" });
  });

  it("sinAsignar y mios filtran por responsable", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_sinasignar");
    const tecnico = await crearSesionNombrada(Rol.TECNICO, "tecnico_sinasignar");
    const t1 = await crearTicketApi(admin.auth);
    await crearTicketApi(admin.auth);
    await request(app).post(`${API}/tickets/${t1.id}/tomar`).set("Authorization", tecnico.auth);

    const sinAsignar = await request(app).get(`${API}/tickets?sinAsignar=true`).set("Authorization", admin.auth);
    const mios = await request(app).get(`${API}/tickets?mios=true`).set("Authorization", tecnico.auth);

    expect(sinAsignar.body.data).toHaveLength(1);
    expect(mios.body.data).toHaveLength(1);
    expect(mios.body.data[0].id).toBe(t1.id);
  });

  it("q busca por numero/asunto/solicitanteNombre con % y _ literales (ESCAPE)", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_q");
    await crearTicketApi(admin.auth, { asunto: "100% falla de red" });
    await crearTicketApi(admin.auth, { asunto: "Otro caso cualquiera" });

    const literal = await request(app).get(`${API}/tickets?${new URLSearchParams({ q: "100%" }).toString()}`).set("Authorization", admin.auth);
    const normal = await request(app).get(`${API}/tickets?q=Otro`).set("Authorization", admin.auth);

    expect(literal.body.data).toHaveLength(1);
    expect(literal.body.data[0].asunto).toContain("100%");
    expect(normal.body.data).toHaveLength(1);
  });

  it("desde/hasta filtran por fecha_ingreso", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_fechas");
    await crearTicketApi(admin.auth);
    // El filtro compara el día calendario en Chile (AT TIME ZONE 'Pacific SA Standard Time' en
    // ticket.service.ts), no en UTC: cerca de la medianoche ambas fechas difieren y el test fallaba
    // con new Date().toISOString(), que da el día en UTC.
    const hoy = DateTime.now().setZone("America/Santiago").toISODate();

    const res = await request(app).get(`${API}/tickets?desde=${hoy}&hasta=${hoy}`).set("Authorization", admin.auth);

    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it("lectura puede listar; sin token 401", async () => {
    const lectura = await crearSesionNombrada(Rol.LECTURA, "lectura_listar");

    const conAuth = await request(app).get(`${API}/tickets`).set("Authorization", lectura.auth);
    const sinAuth = await request(app).get(`${API}/tickets`);

    expect(conAuth.status).toBe(200);
    expect(sinAuth.status).toBe(401);
  });
});
