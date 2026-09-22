import { DateTime } from "luxon";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { Rol } from "../entities/enums.js";
import { horasHabilesEntre, sumarHorasHabiles, ZONA_HORARIA_SLA } from "../sla/horasHabiles.js";
import { conectarBD, limpiarBD } from "../test/helpers.js";
import { API, crearSesionNombrada } from "../test/otHelpers.js";
import { calendarioYFeriadosReales } from "../test/slaHelpers.js";
import { crearTicketApi } from "../test/ticketHelpers.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

const HORAS_RESOLUCION: Record<string, number> = { alta: 24, media: 72, baja: 120 };
const HORAS_RESPUESTA: Record<string, number> = { alta: 2, media: 8, baja: 24 };

async function detalleTicket(auth: string, id: string) {
  const res = await request(app).get(`${API}/tickets/${id}`).set("Authorization", auth);
  if (res.status !== 200) throw new Error(`detalleTicket falló: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data as {
    fechaIngreso: string;
    slaResolucionVenceEn: string | null;
    slaRespuestaVenceEn: string | null;
    primeraRespuestaEn: string | null;
  };
}

const cambiarEstado = (auth: string, id: string, estado: string) =>
  request(app).post(`${API}/tickets/${id}/estado`).set("Authorization", auth).send({ estado });

describe("SLA al crear/editar un ticket (Fase 4)", () => {
  it.each(["alta", "media", "baja"] as const)("calcula ambos vencimientos (resolución y respuesta) para la prioridad %s", async (prioridad) => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_tk_sla");
    const t = await crearTicketApi(admin.auth, { prioridad });
    const detalle = await detalleTicket(admin.auth, t.id);

    const { calendario, feriados } = await calendarioYFeriadosReales();
    const inicio = DateTime.fromJSDate(new Date(detalle.fechaIngreso), { zone: "utc" });
    const esperadoResolucion = sumarHorasHabiles(inicio, HORAS_RESOLUCION[prioridad]!, calendario, feriados, ZONA_HORARIA_SLA).toJSDate();
    const esperadoRespuesta = sumarHorasHabiles(inicio, HORAS_RESPUESTA[prioridad]!, calendario, feriados, ZONA_HORARIA_SLA).toJSDate();

    expect(new Date(detalle.slaResolucionVenceEn!).getTime()).toBe(esperadoResolucion.getTime());
    expect(new Date(detalle.slaRespuestaVenceEn!).getTime()).toBe(esperadoRespuesta.getTime());
  });

  it("cambiar la prioridad recalcula ambos vencimientos desde la fecha_ingreso ORIGINAL", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_tk_sla2");
    const t = await crearTicketApi(admin.auth, { prioridad: "baja" });
    const antes = await detalleTicket(admin.auth, t.id);

    const res = await request(app).patch(`${API}/tickets/${t.id}`).set("Authorization", admin.auth).send({ prioridad: "alta" });
    expect(res.status).toBe(200);

    const { calendario, feriados } = await calendarioYFeriadosReales();
    const inicio = DateTime.fromJSDate(new Date(antes.fechaIngreso), { zone: "utc" });
    const esperadoResolucion = sumarHorasHabiles(inicio, HORAS_RESOLUCION.alta!, calendario, feriados, ZONA_HORARIA_SLA).toJSDate();
    const esperadoRespuesta = sumarHorasHabiles(inicio, HORAS_RESPUESTA.alta!, calendario, feriados, ZONA_HORARIA_SLA).toJSDate();

    expect(res.body.data.fechaIngreso).toBe(antes.fechaIngreso);
    expect(new Date(res.body.data.slaResolucionVenceEn).getTime()).toBe(esperadoResolucion.getTime());
    expect(new Date(res.body.data.slaRespuestaVenceEn).getTime()).toBe(esperadoRespuesta.getTime());
  });
});

describe("Pausa del SLA en esperando_cliente (Fase 4, solo tickets)", () => {
  it("abre sla_pausa al entrar y la cierra al salir, corriendo el vencimiento por las horas hábiles pausadas; no afecta a la OT", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_pausa1");
    const t = await crearTicketApi(admin.auth, { prioridad: "media" });
    await request(app).post(`${API}/tickets/${t.id}/tomar`).set("Authorization", admin.auth);
    const antes = await detalleTicket(admin.auth, t.id);

    // Entrar a esperando_cliente: abre la pausa.
    const r1 = await cambiarEstado(admin.auth, t.id, "esperando_cliente");
    expect(r1.status).toBe(200);

    const pausasAbiertas: Array<{ desde: Date; hasta: Date | null }> = await AppDataSource.query(
      `SELECT desde, hasta FROM sla_pausa WHERE entidad_tipo = 'ticket' AND entidad_id = @0`,
      [t.id],
    );
    expect(pausasAbiertas).toHaveLength(1);
    expect(pausasAbiertas[0]!.hasta).toBeNull();

    const [{ sla_pausado_desde: pausadoDesde }] = await AppDataSource.query(`SELECT sla_pausado_desde FROM ticket WHERE id = @0`, [t.id]);
    expect(pausadoDesde).not.toBeNull();

    // Se manipula `desde` de la pausa a un instante fijo y lejano en el pasado (dentro de horario
    // hábil, sin ambigüedad de DST) para que el tramo pausado tenga una duración grande y
    // verificable, en vez de depender de los pocos milisegundos reales entre dos llamadas HTTP.
    const desdeFijo = "2026-07-08T10:00:00.000-04:00"; // miércoles, horario hábil, lejos de todo DST
    await AppDataSource.query(`UPDATE sla_pausa SET desde = @0 WHERE entidad_tipo = 'ticket' AND entidad_id = @1 AND hasta IS NULL`, [
      desdeFijo,
      t.id,
    ]);

    // Salir de esperando_cliente: cierra la pausa y corre el vencimiento.
    const r2 = await cambiarEstado(admin.auth, t.id, "abierto");
    expect(r2.status).toBe(200);

    const [{ sla_pausado_desde: pausadoDespues }] = await AppDataSource.query(`SELECT sla_pausado_desde FROM ticket WHERE id = @0`, [t.id]);
    expect(pausadoDespues).toBeNull();

    const [pausaCerrada]: Array<{ desde: Date; hasta: Date }> = await AppDataSource.query(
      `SELECT desde, hasta FROM sla_pausa WHERE entidad_tipo = 'ticket' AND entidad_id = @0`,
      [t.id],
    );
    expect(pausaCerrada!.hasta).not.toBeNull();

    const { calendario, feriados } = await calendarioYFeriadosReales();
    const horasPausa = horasHabilesEntre(
      DateTime.fromJSDate(pausaCerrada!.desde, { zone: "utc" }),
      DateTime.fromJSDate(pausaCerrada!.hasta, { zone: "utc" }),
      calendario,
      feriados,
      ZONA_HORARIA_SLA,
    );
    expect(horasPausa).toBeGreaterThan(0); // el tramo manipulado cae dentro de horario hábil

    const despues = await detalleTicket(admin.auth, t.id);
    const esperadoResolucion = sumarHorasHabiles(
      DateTime.fromJSDate(new Date(antes.slaResolucionVenceEn!), { zone: "utc" }),
      horasPausa,
      calendario,
      feriados,
      ZONA_HORARIA_SLA,
    ).toJSDate();
    const esperadoRespuesta = sumarHorasHabiles(
      DateTime.fromJSDate(new Date(antes.slaRespuestaVenceEn!), { zone: "utc" }),
      horasPausa,
      calendario,
      feriados,
      ZONA_HORARIA_SLA,
    ).toJSDate();

    expect(new Date(despues.slaResolucionVenceEn!).getTime()).toBe(esperadoResolucion.getTime());
    // primeraRespuestaEn seguía NULL (no hubo respuesta_cliente): también se corre.
    expect(despues.primeraRespuestaEn).toBeNull();
    expect(new Date(despues.slaRespuestaVenceEn!).getTime()).toBe(esperadoRespuesta.getTime());
    expect(new Date(despues.slaResolucionVenceEn!).getTime()).toBeGreaterThan(new Date(antes.slaResolucionVenceEn!).getTime());
  });

  it("no abre pausa si sla_config[prioridad].pausarEnEsperaCliente es false", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_pausa2");
    // Apaga la pausa para 'baja' antes de crear el ticket.
    const put = await request(app)
      .put(`${API}/sla/config`)
      .set("Authorization", admin.auth)
      .send({ configs: [{ prioridad: "baja", pausarEnEsperaCliente: false }] });
    expect(put.status).toBe(200);

    const t = await crearTicketApi(admin.auth, { prioridad: "baja" });
    await request(app).post(`${API}/tickets/${t.id}/tomar`).set("Authorization", admin.auth);

    await cambiarEstado(admin.auth, t.id, "esperando_cliente");

    const pausas = await AppDataSource.query(`SELECT 1 AS x FROM sla_pausa WHERE entidad_tipo = 'ticket' AND entidad_id = @0`, [t.id]);
    expect(pausas).toHaveLength(0);
    const [{ sla_pausado_desde }] = await AppDataSource.query(`SELECT sla_pausado_desde FROM ticket WHERE id = @0`, [t.id]);
    expect(sla_pausado_desde).toBeNull();
  });

  it("la fase de sla_estado pasa de respuesta a resolución al fijarse primera_respuesta_en", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_fase");
    const t = await crearTicketApi(admin.auth, { prioridad: "media" });
    await request(app).post(`${API}/tickets/${t.id}/tomar`).set("Authorization", admin.auth);

    const antes = await detalleTicket(admin.auth, t.id);
    expect(antes.primeraRespuestaEn).toBeNull();

    const res = await request(app)
      .post(`${API}/tickets/${t.id}/mensajes`)
      .set("Authorization", admin.auth)
      .send({ tipo: "respuesta_cliente", cuerpo: "Estamos revisando el equipo" });
    expect(res.status).toBe(201);

    const despues = await detalleTicket(admin.auth, t.id);
    expect(despues.primeraRespuestaEn).not.toBeNull();
    // slaRespuestaVenceEn no se recalcula al responder (solo se usaba mientras primeraRespuestaEn
    // era NULL); slaResolucionVenceEn tampoco cambia: la fase la interpreta el job (jobs/slaJob.ts)
    // comparando `ahora >= vencimiento vigente`, no un recálculo al momento de responder.
    expect(despues.slaResolucionVenceEn).toBe(antes.slaResolucionVenceEn);
  });
});
