import { DateTime } from "luxon";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { Rol } from "../entities/enums.js";
import { sumarHorasHabiles, ZONA_HORARIA_SLA } from "../sla/horasHabiles.js";
import { conectarBD, limpiarBD } from "../test/helpers.js";
import { API, crearClienteTest, crearOtApi, crearSesionNombrada } from "../test/otHelpers.js";
import { calendarioYFeriadosReales } from "../test/slaHelpers.js";
import { crearTicketApi } from "../test/ticketHelpers.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

describe("GET /sla/config", () => {
  it("cualquiera con rol lectura o superior ve las 3 filas con la semilla", async () => {
    const lectura = await crearSesionNombrada(Rol.LECTURA, "lectura_sla");
    const res = await request(app).get(`${API}/sla/config`).set("Authorization", lectura.auth);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    const alta = res.body.data.find((c: { prioridad: string }) => c.prioridad === "alta");
    expect(alta).toMatchObject({ horasResolucion: 24, horasPrimeraRespuesta: 2, usarHorasHabiles: true, pausarEnEsperaCliente: true });
  });
});

describe("PUT /sla/config", () => {
  it("RBAC: solo admin puede editar", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_cfg_rbac");
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_cfg_rbac");
    const tecnico = await crearSesionNombrada(Rol.TECNICO, "tecnico_cfg_rbac");
    const lectura = await crearSesionNombrada(Rol.LECTURA, "lectura_cfg_rbac");
    const body = { configs: [{ prioridad: "media", horasResolucion: 48 }] };

    const rGestion = await request(app).put(`${API}/sla/config`).set("Authorization", gestion.auth).send(body);
    const rTecnico = await request(app).put(`${API}/sla/config`).set("Authorization", tecnico.auth).send(body);
    const rLectura = await request(app).put(`${API}/sla/config`).set("Authorization", lectura.auth).send(body);
    const rAdmin = await request(app).put(`${API}/sla/config`).set("Authorization", admin.auth).send(body);

    expect(rGestion.status).toBe(403);
    expect(rTecnico.status).toBe(403);
    expect(rLectura.status).toBe(403);
    expect(rAdmin.status).toBe(200);
  });

  it("valida rangos: horas debe ser entero > 0, umbralPorVencer en (0,1]", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_cfg_val");

    const horasCero = await request(app)
      .put(`${API}/sla/config`)
      .set("Authorization", admin.auth)
      .send({ configs: [{ prioridad: "alta", horasResolucion: 0 }] });
    expect(horasCero.status).toBe(400);

    const horasDecimal = await request(app)
      .put(`${API}/sla/config`)
      .set("Authorization", admin.auth)
      .send({ configs: [{ prioridad: "alta", horasResolucion: 2.5 }] });
    expect(horasDecimal.status).toBe(400);

    const umbralCero = await request(app)
      .put(`${API}/sla/config`)
      .set("Authorization", admin.auth)
      .send({ configs: [{ prioridad: "alta", umbralPorVencer: 0 }] });
    expect(umbralCero.status).toBe(400);

    const umbralMayorAUno = await request(app)
      .put(`${API}/sla/config`)
      .set("Authorization", admin.auth)
      .send({ configs: [{ prioridad: "alta", umbralPorVencer: 1.5 }] });
    expect(umbralMayorAUno.status).toBe(400);

    const umbralValido = await request(app)
      .put(`${API}/sla/config`)
      .set("Authorization", admin.auth)
      .send({ configs: [{ prioridad: "alta", umbralPorVencer: 1 }] }); // 1 es válido: (0,1]
    expect(umbralValido.status).toBe(200);
  });

  it("recalcula en lote solo lo ABIERTO de esa prioridad, dejando intactas otras prioridades y lo terminal", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_cfg_lote");
    const cliente = await crearClienteTest();

    const otMedia = await crearOtApi(admin.auth, cliente.id, { prioridad: "media" });
    const otAlta = await crearOtApi(admin.auth, cliente.id, { prioridad: "alta" });
    const otTerminada = await crearOtApi(admin.auth, cliente.id, { prioridad: "media" });
    await request(app).post(`${API}/ots/${otTerminada.id}/estado`).set("Authorization", admin.auth).send({ estado: "terminado" });

    const [antesMedia, antesAlta, antesTerminada]: Array<{ sla_resolucion_vence_en: Date }> = await Promise.all([
      AppDataSource.query(`SELECT sla_resolucion_vence_en FROM ot WHERE id = @0`, [otMedia.id]).then((r) => r[0]),
      AppDataSource.query(`SELECT sla_resolucion_vence_en FROM ot WHERE id = @0`, [otAlta.id]).then((r) => r[0]),
      AppDataSource.query(`SELECT sla_resolucion_vence_en FROM ot WHERE id = @0`, [otTerminada.id]).then((r) => r[0]),
    ]);

    const res = await request(app)
      .put(`${API}/sla/config`)
      .set("Authorization", admin.auth)
      .send({ configs: [{ prioridad: "media", horasResolucion: 40 }] });
    expect(res.status).toBe(200);

    const [despuesMedia, despuesAlta, despuesTerminada]: Array<{ sla_resolucion_vence_en: Date; fecha_ingreso: Date }> = await Promise.all([
      AppDataSource.query(`SELECT sla_resolucion_vence_en, fecha_ingreso FROM ot WHERE id = @0`, [otMedia.id]).then((r) => r[0]),
      AppDataSource.query(`SELECT sla_resolucion_vence_en, fecha_ingreso FROM ot WHERE id = @0`, [otAlta.id]).then((r) => r[0]),
      AppDataSource.query(`SELECT sla_resolucion_vence_en, fecha_ingreso FROM ot WHERE id = @0`, [otTerminada.id]).then((r) => r[0]),
    ]);

    // Alta y la terminada (aunque sea media) no se tocaron.
    expect(despuesAlta.sla_resolucion_vence_en.getTime()).toBe(antesAlta.sla_resolucion_vence_en.getTime());
    expect(despuesTerminada.sla_resolucion_vence_en.getTime()).toBe(antesTerminada.sla_resolucion_vence_en.getTime());

    // La OT media abierta sí se recalculó con las nuevas 40 horas, desde su propia fecha_ingreso.
    expect(despuesMedia.sla_resolucion_vence_en.getTime()).not.toBe(antesMedia.sla_resolucion_vence_en.getTime());
    const { calendario, feriados } = await calendarioYFeriadosReales();
    const esperado = sumarHorasHabiles(
      DateTime.fromJSDate(despuesMedia.fecha_ingreso, { zone: "utc" }),
      40,
      calendario,
      feriados,
      ZONA_HORARIA_SLA,
    ).toJSDate();
    expect(despuesMedia.sla_resolucion_vence_en.getTime()).toBe(esperado.getTime());
  });

  it("recalcula en lote también los tickets abiertos de esa prioridad (ambos vencimientos)", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_cfg_ticket");
    const t = await crearTicketApi(admin.auth, { prioridad: "baja" });

    const res = await request(app)
      .put(`${API}/sla/config`)
      .set("Authorization", admin.auth)
      .send({ configs: [{ prioridad: "baja", horasResolucion: 200, horasPrimeraRespuesta: 40 }] });
    expect(res.status).toBe(200);

    const [fila]: Array<{ sla_resolucion_vence_en: Date; sla_respuesta_vence_en: Date; fecha_ingreso: Date }> = await AppDataSource.query(
      `SELECT sla_resolucion_vence_en, sla_respuesta_vence_en, fecha_ingreso FROM ticket WHERE id = @0`,
      [t.id],
    );

    const { calendario, feriados } = await calendarioYFeriadosReales();
    const inicio = DateTime.fromJSDate(fila.fecha_ingreso, { zone: "utc" });
    const esperadoResolucion = sumarHorasHabiles(inicio, 200, calendario, feriados, ZONA_HORARIA_SLA).toJSDate();
    const esperadoRespuesta = sumarHorasHabiles(inicio, 40, calendario, feriados, ZONA_HORARIA_SLA).toJSDate();

    expect(fila.sla_resolucion_vence_en.getTime()).toBe(esperadoResolucion.getTime());
    expect(fila.sla_respuesta_vence_en.getTime()).toBe(esperadoRespuesta.getTime());
  });
});
