import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { Rol } from "../entities/enums.js";
import { conectarBD, limpiarBD, obtenerPrioridadPorNombre } from "../test/helpers.js";
import { API, cotizacionBody, crearClienteTest, crearOtApi, crearSesionNombrada } from "../test/otHelpers.js";
import { crearTicketApi } from "../test/ticketHelpers.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

const get = (auth: string, url: string) => request(app).get(`${API}${url}`).set("Authorization", auth);
const post = (auth: string, url: string, body: object = {}) => request(app).post(`${API}${url}`).set("Authorization", auth).send(body);

interface EstadoDto {
  estado: string;
  cantidad: number;
}

describe("GET /dashboard - OT (foto actual)", () => {
  it("otActivas cuenta OT no terminales; otConSlaVencido solo las vencidas y no terminales", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_dash1");
    const cliente = await crearClienteTest("Cliente Dash 1");

    const a = await crearOtApi(admin.auth, cliente.id); // queda "ingresado"
    const b = await crearOtApi(admin.auth, cliente.id); // se marca vencida
    const c = await crearOtApi(admin.auth, cliente.id);
    await post(admin.auth, `/ots/${c.id}/estado`, { estado: "terminado" });
    await AppDataSource.query(`UPDATE ot SET sla_estado = 'vencida' WHERE id = @0`, [b.id]);
    void a;

    const res = await get(admin.auth, "/dashboard");
    expect(res.status).toBe(200);
    expect(res.body.data.otActivas).toBe(2); // a y b, no c (terminado)
    expect(res.body.data.otConSlaVencido).toBe(1); // solo b

    // Una OT terminal marcada "vencida" a mano no debe contar: la condición exige NO terminal.
    await AppDataSource.query(`UPDATE ot SET sla_estado = 'vencida' WHERE id = @0`, [c.id]);
    const res2 = await get(admin.auth, "/dashboard");
    expect(res2.body.data.otConSlaVencido).toBe(1);
  });

  it("otPorEstado incluye los 6 estados, incluso en 0, en el orden del kanban", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_dash4");
    const cliente = await crearClienteTest("Cliente Dash Estado");
    await crearOtApi(admin.auth, cliente.id); // queda "ingresado"

    const res = await get(admin.auth, "/dashboard");
    const porEstado: EstadoDto[] = res.body.data.otPorEstado;
    expect(porEstado.map((p) => p.estado)).toEqual(["ingresado", "en_cotizacion", "aprobado", "en_ejecucion", "terminado", "facturado"]);
    expect(porEstado.find((p) => p.estado === "ingresado")!.cantidad).toBe(1);
    expect(porEstado.find((p) => p.estado === "aprobado")!.cantidad).toBe(0);
  });

  it("otPorCliente: top clientes por cantidad de OT activas, excluye OT internas (sin cliente)", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_dash5");
    const c1 = await crearClienteTest("Cliente Dash Top 1");
    const c2 = await crearClienteTest("Cliente Dash Top 2");
    await crearOtApi(admin.auth, c1.id);
    await crearOtApi(admin.auth, c1.id);
    await crearOtApi(admin.auth, c2.id);
    const media = await obtenerPrioridadPorNombre("Media");
    await post(admin.auth, "/ots", {
      titulo: "Interna",
      descripcion: "Mantención de red interna",
      esInterna: true,
      areaInterna: "TI",
      categoria: "soporte",
      prioridadId: media.id,
      origen: "interna",
    });

    const res = await get(admin.auth, "/dashboard");
    const porCliente: Array<{ clienteId: string; clienteNombre: string; cantidad: number }> = res.body.data.otPorCliente;
    expect(porCliente[0]).toMatchObject({ clienteId: c1.id, clienteNombre: "Cliente Dash Top 1", cantidad: 2 });
    expect(porCliente.some((p) => p.clienteId === c2.id && p.cantidad === 1)).toBe(true);
    // Ningún registro corresponde a la OT interna (no tiene cliente).
    expect(porCliente.reduce((acc, p) => acc + p.cantidad, 0)).toBe(3);
  });

  it("otPorResponsable agrupa OT activas por responsable actual, sin límite", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_dash6");
    const tec = await crearSesionNombrada(Rol.TECNICO, "tec_dash6");
    const cliente = await crearClienteTest("Cliente Dash Resp");
    await crearOtApi(admin.auth, cliente.id, { responsableId: tec.usuario.id });
    await crearOtApi(admin.auth, cliente.id, { responsableId: tec.usuario.id });

    const res = await get(admin.auth, "/dashboard");
    const porResp: Array<{ usuarioId: string; usuarioNombre: string; cantidad: number }> = res.body.data.otPorResponsable;
    expect(porResp.find((p) => p.usuarioId === tec.usuario.id)).toMatchObject({ cantidad: 2 });
  });
});

describe("GET /dashboard - montoCotizacionesAprobadas (filtrado por aprobada_en)", () => {
  it("suma solo las aprobadas, filtradas por desde/hasta; sin filtro es histórico completo", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_dash1");
    const cliente = await crearClienteTest("Cliente Dash Monto");

    const c1 = await post(gestion.auth, "/cotizaciones", cotizacionBody({ clienteId: cliente.id, montoClp: 100000 }));
    const c2 = await post(gestion.auth, "/cotizaciones", cotizacionBody({ clienteId: cliente.id, montoClp: 200000 }));
    await post(gestion.auth, "/cotizaciones", cotizacionBody({ clienteId: cliente.id, montoClp: 300000 })); // queda en borrador: nunca suma

    for (const id of [c1.body.data.id, c2.body.data.id]) {
      await post(gestion.auth, `/cotizaciones/${id}/estado`, { estado: "enviada" });
      await post(gestion.auth, `/cotizaciones/${id}/estado`, { estado: "aprobada" });
    }
    // c1 aprobada fuera del rango que se va a filtrar; c2 dentro.
    await AppDataSource.query(`UPDATE cotizacion SET aprobada_en = @0 WHERE id = @1`, ["2026-01-10T12:00:00.000+00:00", c1.body.data.id]);
    await AppDataSource.query(`UPDATE cotizacion SET aprobada_en = @0 WHERE id = @1`, ["2026-09-15T12:00:00.000+00:00", c2.body.data.id]);

    const sinFiltro = await get(gestion.auth, "/dashboard");
    expect(sinFiltro.body.data.montoCotizacionesAprobadas).toBe(300000);

    const conFiltro = await get(gestion.auth, "/dashboard?desde=2026-09-01&hasta=2026-09-30");
    expect(conFiltro.body.data.montoCotizacionesAprobadas).toBe(200000);
  });
});

describe("GET /dashboard - tiempoMedioResolucionDias (filtrado por terminado_en)", () => {
  it("promedia días de resolución de OT terminadas, filtrado por terminado_en", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_dash2");
    const cliente = await crearClienteTest("Cliente Dash Tiempo");

    const o1 = await crearOtApi(admin.auth, cliente.id);
    const o2 = await crearOtApi(admin.auth, cliente.id);
    await post(admin.auth, `/ots/${o1.id}/estado`, { estado: "terminado" });
    await post(admin.auth, `/ots/${o2.id}/estado`, { estado: "terminado" });

    // o1: 2 días exactos, terminado DENTRO del rango que se va a filtrar.
    await AppDataSource.query(`UPDATE ot SET fecha_ingreso = @0, terminado_en = @1 WHERE id = @2`, [
      "2026-09-10T12:00:00.000+00:00",
      "2026-09-12T12:00:00.000+00:00",
      o1.id,
    ]);
    // o2: 10 días, terminado FUERA del rango.
    await AppDataSource.query(`UPDATE ot SET fecha_ingreso = @0, terminado_en = @1 WHERE id = @2`, [
      "2026-08-01T12:00:00.000+00:00",
      "2026-08-11T12:00:00.000+00:00",
      o2.id,
    ]);

    const sinFiltro = await get(admin.auth, "/dashboard");
    expect(sinFiltro.body.data.tiempoMedioResolucionDias).toBeCloseTo((2 + 10) / 2, 5);

    const conFiltro = await get(admin.auth, "/dashboard?desde=2026-09-01&hasta=2026-09-30");
    expect(conFiltro.body.data.tiempoMedioResolucionDias).toBe(2);
  });

  it("null si no hay OT terminadas", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_dash3");
    const cliente = await crearClienteTest("Cliente Dash Sin Terminar");
    await crearOtApi(admin.auth, cliente.id);

    const res = await get(admin.auth, "/dashboard");
    expect(res.body.data.tiempoMedioResolucionDias).toBeNull();
  });
});

describe("GET /dashboard - cotizacionesPorEstado (filtrado por fecha)", () => {
  it("incluye los 4 estados, cuenta y suma el monto, filtrado por fecha", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_dash2");
    const cliente = await crearClienteTest("Cliente Dash Cot Estado");

    await post(gestion.auth, "/cotizaciones", cotizacionBody({ clienteId: cliente.id, montoClp: 50000, fecha: "2026-09-10" }));
    await post(gestion.auth, "/cotizaciones", cotizacionBody({ clienteId: cliente.id, montoClp: 70000, fecha: "2026-01-01" }));

    const sinFiltro = await get(gestion.auth, "/dashboard");
    const porEstadoSin: Array<{ estado: string; cantidad: number; montoClp: number }> = sinFiltro.body.data.cotizacionesPorEstado;
    expect(porEstadoSin.map((c) => c.estado)).toEqual(["borrador", "enviada", "aprobada", "rechazada"]);
    expect(porEstadoSin.find((c) => c.estado === "borrador")).toMatchObject({ cantidad: 2, montoClp: 120000 });
    expect(porEstadoSin.find((c) => c.estado === "enviada")).toMatchObject({ cantidad: 0, montoClp: 0 });

    const conFiltro = await get(gestion.auth, "/dashboard?desde=2026-09-01&hasta=2026-09-30");
    const porEstadoCon: Array<{ estado: string; cantidad: number; montoClp: number }> = conFiltro.body.data.cotizacionesPorEstado;
    expect(porEstadoCon.find((c) => c.estado === "borrador")).toMatchObject({ cantidad: 1, montoClp: 50000 });
  });
});

describe("GET /dashboard - tickets", () => {
  it("ticketsSinResponderFueraDeSla: foto actual, primera_respuesta_en NULL y sla_estado vencida", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_dash7");
    const t1 = await crearTicketApi(admin.auth);
    await crearTicketApi(admin.auth); // queda en_plazo, no cuenta
    await AppDataSource.query(`UPDATE ticket SET sla_estado = 'vencida' WHERE id = @0`, [t1.id]);

    const res = await get(admin.auth, "/dashboard");
    expect(res.body.data.ticketsSinResponderFueraDeSla).toBe(1);
  });

  it("tiempoMedioPrimeraRespuestaHoras: horas de reloj (no hábiles), filtrado por primera_respuesta_en", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_dash8");
    const t1 = await crearTicketApi(admin.auth);
    const t2 = await crearTicketApi(admin.auth);

    // t1: 3 horas de reloj, DENTRO del rango a filtrar.
    await AppDataSource.query(`UPDATE ticket SET fecha_ingreso = @0, primera_respuesta_en = @1 WHERE id = @2`, [
      "2026-09-10T09:00:00.000+00:00",
      "2026-09-10T12:00:00.000+00:00",
      t1.id,
    ]);
    // t2: 9 horas, FUERA del rango.
    await AppDataSource.query(`UPDATE ticket SET fecha_ingreso = @0, primera_respuesta_en = @1 WHERE id = @2`, [
      "2026-08-01T09:00:00.000+00:00",
      "2026-08-01T18:00:00.000+00:00",
      t2.id,
    ]);

    const sinFiltro = await get(admin.auth, "/dashboard");
    expect(sinFiltro.body.data.tiempoMedioPrimeraRespuestaHoras).toBeCloseTo((3 + 9) / 2, 5);

    const conFiltro = await get(admin.auth, "/dashboard?desde=2026-09-01&hasta=2026-09-30");
    expect(conFiltro.body.data.tiempoMedioPrimeraRespuestaHoras).toBe(3);
  });

  it("null si ningún ticket tiene primera respuesta", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_dash9");
    await crearTicketApi(admin.auth);

    const res = await get(admin.auth, "/dashboard");
    expect(res.body.data.tiempoMedioPrimeraRespuestaHoras).toBeNull();
  });
});

describe("GET /dashboard - validación, rango de fechas y RBAC", () => {
  it("hasta anterior a desde: 400 VALIDATION_ERROR", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_dash10");
    const res = await get(admin.auth, "/dashboard?desde=2026-09-20&hasta=2026-09-10");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("sin desde/hasta no filtra por fecha (histórico completo)", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_dash3");
    const cliente = await crearClienteTest("Cliente Dash Historico");
    await post(gestion.auth, "/cotizaciones", cotizacionBody({ clienteId: cliente.id, montoClp: 999, fecha: "2020-01-01" }));

    const res = await get(gestion.auth, "/dashboard");
    expect(res.body.data.cotizacionesPorEstado.find((c: EstadoDto) => c.estado === "borrador").cantidad).toBeGreaterThanOrEqual(1);
  });

  it("el filtro de fecha afecta solo los campos filtrados, no los de foto actual", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_dash11");
    const cliente = await crearClienteTest("Cliente Dash Foto");
    await crearOtApi(admin.auth, cliente.id);

    const sinFiltro = await get(admin.auth, "/dashboard");
    const conFiltroFuturo = await get(admin.auth, "/dashboard?desde=2099-01-01&hasta=2099-12-31");

    expect(conFiltroFuturo.body.data.otActivas).toBe(sinFiltro.body.data.otActivas);
    expect(conFiltroFuturo.body.data.otConSlaVencido).toBe(sinFiltro.body.data.otConSlaVencido);
    expect(conFiltroFuturo.body.data.otPorEstado).toEqual(sinFiltro.body.data.otPorEstado);
    expect(conFiltroFuturo.body.data.otPorCliente).toEqual(sinFiltro.body.data.otPorCliente);
    expect(conFiltroFuturo.body.data.otPorResponsable).toEqual(sinFiltro.body.data.otPorResponsable);
    expect(conFiltroFuturo.body.data.ticketsSinResponderFueraDeSla).toBe(sinFiltro.body.data.ticketsSinResponderFueraDeSla);
  });

  it("lectura puede acceder; sin token 401", async () => {
    const lectura = await crearSesionNombrada(Rol.LECTURA, "lectura_dash");
    const ok = await get(lectura.auth, "/dashboard");
    expect(ok.status).toBe(200);

    const sinToken = await request(app).get(`${API}/dashboard`);
    expect(sinToken.status).toBe(401);
  });
});
