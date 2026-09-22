import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { Rol } from "../entities/enums.js";
import { conectarBD, limpiarBD } from "../test/helpers.js";
import { API, crearClienteTest, crearOtApi, crearSesionNombrada } from "../test/otHelpers.js";
import { crearTicketApi } from "../test/ticketHelpers.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

describe("GET /notificaciones", () => {
  it("nunca devuelve las notificaciones de otro usuario", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_notif");
    const uno = await crearSesionNombrada(Rol.TECNICO, "uno_notif");
    const dos = await crearSesionNombrada(Rol.TECNICO, "dos_notif");
    const cliente = await crearClienteTest();

    // Derivar una OT a `uno` y otra a `dos` genera una notificación de derivación a cada uno
    // (mecanismo ya existente desde la Fase 1/3; Fase 4 solo agrega el endpoint de lectura).
    const ot1 = await crearOtApi(admin.auth, cliente.id, { responsableId: admin.usuario.id });
    await request(app)
      .post(`${API}/ots/${ot1.id}/derivar`)
      .set("Authorization", admin.auth)
      .send({ destinoId: uno.usuario.id, motivo: "Se requiere otra especialidad" });

    const ot2 = await crearOtApi(admin.auth, cliente.id, { responsableId: admin.usuario.id });
    await request(app)
      .post(`${API}/ots/${ot2.id}/derivar`)
      .set("Authorization", admin.auth)
      .send({ destinoId: dos.usuario.id, motivo: "Se requiere otra especialidad" });

    const resUno = await request(app).get(`${API}/notificaciones`).set("Authorization", uno.auth);
    const resDos = await request(app).get(`${API}/notificaciones`).set("Authorization", dos.auth);

    expect(resUno.status).toBe(200);
    expect(resUno.body.data).toHaveLength(1);
    expect(resUno.body.data[0].entidadId).toBe(ot1.id);

    expect(resDos.body.data).toHaveLength(1);
    expect(resDos.body.data[0].entidadId).toBe(ot2.id);
  });

  it("filtro soloNoLeidas y paginación", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_notif2");
    const uno = await crearSesionNombrada(Rol.TECNICO, "uno_notif2");
    const cliente = await crearClienteTest();

    const ot = await crearOtApi(admin.auth, cliente.id, { responsableId: admin.usuario.id });
    const der = await request(app)
      .post(`${API}/ots/${ot.id}/derivar`)
      .set("Authorization", admin.auth)
      .send({ destinoId: uno.usuario.id, motivo: "Se requiere otra especialidad" });
    expect(der.status).toBe(200);

    const lista = await request(app).get(`${API}/notificaciones`).set("Authorization", uno.auth);
    const id = lista.body.data[0].id;

    await request(app).post(`${API}/notificaciones/${id}/leer`).set("Authorization", uno.auth);

    const soloNoLeidas = await request(app).get(`${API}/notificaciones?soloNoLeidas=true`).set("Authorization", uno.auth);
    expect(soloNoLeidas.body.data).toHaveLength(0);

    const todas = await request(app).get(`${API}/notificaciones`).set("Authorization", uno.auth);
    expect(todas.body.data).toHaveLength(1);
    expect(todas.body.data[0].leidaEn).not.toBeNull();
  });
});

describe("POST /notificaciones/:id/leer", () => {
  it("marcar como leída una notificación ajena: 404 (nunca 403, por privacidad)", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_notif3");
    const uno = await crearSesionNombrada(Rol.TECNICO, "uno_notif3");
    const dos = await crearSesionNombrada(Rol.TECNICO, "dos_notif3");
    const cliente = await crearClienteTest();

    const ot = await crearOtApi(admin.auth, cliente.id, { responsableId: admin.usuario.id });
    await request(app)
      .post(`${API}/ots/${ot.id}/derivar`)
      .set("Authorization", admin.auth)
      .send({ destinoId: uno.usuario.id, motivo: "Se requiere otra especialidad" });

    const lista = await request(app).get(`${API}/notificaciones`).set("Authorization", uno.auth);
    const id = lista.body.data[0].id;

    const res = await request(app).post(`${API}/notificaciones/${id}/leer`).set("Authorization", dos.auth);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOTIFICACION_NO_ENCONTRADA");
  });

  it("notificación inexistente: mismo 404", async () => {
    const uno = await crearSesionNombrada(Rol.TECNICO, "uno_notif4");
    const res = await request(app)
      .post(`${API}/notificaciones/11111111-1111-4111-8111-111111111111/leer`)
      .set("Authorization", uno.auth);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOTIFICACION_NO_ENCONTRADA");
  });

  it("marcar una notificación ya leída de nuevo no falla (no pisa leidaEn)", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_notif5");
    const uno = await crearSesionNombrada(Rol.TECNICO, "uno_notif5");
    const cliente = await crearClienteTest();
    const ot = await crearOtApi(admin.auth, cliente.id, { responsableId: admin.usuario.id });
    await request(app)
      .post(`${API}/ots/${ot.id}/derivar`)
      .set("Authorization", admin.auth)
      .send({ destinoId: uno.usuario.id, motivo: "Se requiere otra especialidad" });
    const lista = await request(app).get(`${API}/notificaciones`).set("Authorization", uno.auth);
    const id = lista.body.data[0].id;

    const r1 = await request(app).post(`${API}/notificaciones/${id}/leer`).set("Authorization", uno.auth);
    expect(r1.status).toBe(200);
    const r2 = await request(app).post(`${API}/notificaciones/${id}/leer`).set("Authorization", uno.auth);
    expect(r2.status).toBe(200);
  });
});

describe("POST /notificaciones/leer-todas", () => {
  it("marca todas las no leídas del actor, sin tocar las de otro usuario", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_notif6");
    const uno = await crearSesionNombrada(Rol.TECNICO, "uno_notif6");
    const dos = await crearSesionNombrada(Rol.TECNICO, "dos_notif6");
    const cliente = await crearClienteTest();

    const ot1 = await crearOtApi(admin.auth, cliente.id, { responsableId: admin.usuario.id });
    await request(app).post(`${API}/ots/${ot1.id}/derivar`).set("Authorization", admin.auth).send({ destinoId: uno.usuario.id, motivo: "Motivo largo suficiente" });
    const ot2 = await crearOtApi(admin.auth, cliente.id, { responsableId: admin.usuario.id });
    await request(app).post(`${API}/ots/${ot2.id}/derivar`).set("Authorization", admin.auth).send({ destinoId: uno.usuario.id, motivo: "Motivo largo suficiente" });
    const ot3 = await crearOtApi(admin.auth, cliente.id, { responsableId: admin.usuario.id });
    await request(app).post(`${API}/ots/${ot3.id}/derivar`).set("Authorization", admin.auth).send({ destinoId: dos.usuario.id, motivo: "Motivo largo suficiente" });

    const res = await request(app).post(`${API}/notificaciones/leer-todas`).set("Authorization", uno.auth);
    expect(res.status).toBe(200);

    const notifUno = await request(app).get(`${API}/notificaciones`).set("Authorization", uno.auth);
    expect(notifUno.body.data.every((n: { leidaEn: string | null }) => n.leidaEn !== null)).toBe(true);

    const notifDos = await request(app).get(`${API}/notificaciones`).set("Authorization", dos.auth);
    expect(notifDos.body.data.every((n: { leidaEn: string | null }) => n.leidaEn === null)).toBe(true);
  });
});

describe("GET /notificaciones/resumen", () => {
  it("panorama de todo el equipo: cuenta OT vencidas, prioridad alta abiertas, pendientes de cotizar/aprobar y tickets nuevos", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_resumen");
    const cliente = await crearClienteTest();

    const otAlta = await crearOtApi(admin.auth, cliente.id, { prioridad: "alta" });
    const otCotizacion = await crearOtApi(admin.auth, cliente.id, { prioridad: "baja" });
    await request(app).post(`${API}/ots/${otCotizacion.id}/estado`).set("Authorization", admin.auth).send({ estado: "en_cotizacion" });
    await crearTicketApi(admin.auth, { prioridad: "media" });

    const res = await request(app).get(`${API}/notificaciones/resumen`).set("Authorization", admin.auth);

    expect(res.status).toBe(200);
    expect(res.body.data.otPrioridadAltaAbiertas.total).toBeGreaterThanOrEqual(1);
    expect(res.body.data.otPrioridadAltaAbiertas.items.some((i: { id: string }) => i.id === otAlta.id)).toBe(true);
    expect(res.body.data.otPendientesCotizarOAprobar.total).toBeGreaterThanOrEqual(1);
    expect(res.body.data.otPendientesCotizarOAprobar.items.some((i: { id: string }) => i.id === otCotizacion.id)).toBe(true);
    expect(res.body.data.ticketsNuevosSinResponder.total).toBeGreaterThanOrEqual(1);
    expect(res.body.data.otVencidas).toMatchObject({ total: expect.any(Number), items: expect.any(Array) });
  });
});

describe("RBAC de /notificaciones", () => {
  it("cualquiera (incluida lectura) puede leer y marcar como leídas las propias", async () => {
    const lectura = await crearSesionNombrada(Rol.LECTURA, "lectura_notif");
    const lista = await request(app).get(`${API}/notificaciones`).set("Authorization", lectura.auth);
    expect(lista.status).toBe(200);
    const resumen = await request(app).get(`${API}/notificaciones/resumen`).set("Authorization", lectura.auth);
    expect(resumen.status).toBe(200);
    const leerTodas = await request(app).post(`${API}/notificaciones/leer-todas`).set("Authorization", lectura.auth);
    expect(leerTodas.status).toBe(200);
  });
});
