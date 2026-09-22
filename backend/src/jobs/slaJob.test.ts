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
import { evaluarSla } from "./slaJob.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

async function ahoraReal(): Promise<Date> {
  const [{ ahora }]: Array<{ ahora: Date }> = await AppDataSource.query(`SELECT CAST(SYSDATETIMEOFFSET() AS datetimeoffset(3)) AS ahora`);
  return ahora;
}

async function horasDesdeAhora(horas: number): Promise<Date> {
  const { calendario, feriados } = await calendarioYFeriadosReales();
  const ahora = await ahoraReal();
  return sumarHorasHabiles(DateTime.fromJSDate(ahora, { zone: "utc" }), horas, calendario, feriados, ZONA_HORARIA_SLA).toJSDate();
}

const HACE_MUCHO = new Date("2020-01-01T12:00:00Z");

function contarNotificaciones(entidadId: string, tipo: string): Promise<number> {
  return AppDataSource.query(`SELECT COUNT(*) AS n FROM notificacion WHERE entidad_id = @0 AND tipo = @1`, [entidadId, tipo]).then(
    (r: Array<{ n: number }>) => Number(r[0]!.n),
  );
}

describe("evaluarSla (jobs/slaJob.ts)", () => {
  it("en_plazo -> por_vencer -> vencida, notifica solo en la transición, es idempotente", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_job1");
    const cliente = await crearClienteTest();
    // Alta: 24h resolución, umbral 20% => por_vencer con menos de 4.8h hábiles restantes.
    const ot = await crearOtApi(admin.auth, cliente.id, { prioridad: "alta", responsableId: admin.usuario.id });

    // Recién creada: bastante más de 4.8h hábiles por delante (~24h) -> sigue en_plazo.
    await evaluarSla();
    let [fila]: Array<{ sla_estado: string }> = await AppDataSource.query(`SELECT sla_estado FROM ot WHERE id = @0`, [ot.id]);
    expect(fila!.sla_estado).toBe("en_plazo");
    expect(await contarNotificaciones(ot.id, "sla_por_vencer")).toBe(0);

    // Se fuerza a menos de 2h hábiles restantes: debe pasar a por_vencer y notificar UNA vez.
    const vencePronto = await horasDesdeAhora(2);
    await AppDataSource.query(`UPDATE ot SET sla_resolucion_vence_en = @0 WHERE id = @1`, [vencePronto.toISOString(), ot.id]);
    await evaluarSla();
    [fila] = await AppDataSource.query(`SELECT sla_estado FROM ot WHERE id = @0`, [ot.id]);
    expect(fila!.sla_estado).toBe("por_vencer");
    expect(await contarNotificaciones(ot.id, "sla_por_vencer")).toBe(1);

    // Correr el job de nuevo sin que cambie nada: no duplica la notificación.
    await evaluarSla();
    [fila] = await AppDataSource.query(`SELECT sla_estado FROM ot WHERE id = @0`, [ot.id]);
    expect(fila!.sla_estado).toBe("por_vencer");
    expect(await contarNotificaciones(ot.id, "sla_por_vencer")).toBe(1);

    // Se fuerza a vencida: transición y UNA notificación de vencida (la de por_vencer sigue en 1).
    await AppDataSource.query(`UPDATE ot SET sla_resolucion_vence_en = @0 WHERE id = @1`, [HACE_MUCHO.toISOString(), ot.id]);
    await evaluarSla();
    [fila] = await AppDataSource.query(`SELECT sla_estado FROM ot WHERE id = @0`, [ot.id]);
    expect(fila!.sla_estado).toBe("vencida");
    expect(await contarNotificaciones(ot.id, "sla_vencida")).toBe(1);
    expect(await contarNotificaciones(ot.id, "sla_por_vencer")).toBe(1);

    // Y de nuevo: idempotente.
    await evaluarSla();
    expect(await contarNotificaciones(ot.id, "sla_vencida")).toBe(1);
  });

  it("una entidad en estado terminal nunca se toca, aunque su vencimiento ya haya pasado", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_job2");
    const cliente = await crearClienteTest();
    const ot = await crearOtApi(admin.auth, cliente.id, { prioridad: "alta", responsableId: admin.usuario.id });
    await request(app).post(`${API}/ots/${ot.id}/estado`).set("Authorization", admin.auth).send({ estado: "terminado" });

    await AppDataSource.query(`UPDATE ot SET sla_resolucion_vence_en = @0 WHERE id = @1`, [HACE_MUCHO.toISOString(), ot.id]);
    await evaluarSla();

    const [fila]: Array<{ sla_estado: string }> = await AppDataSource.query(`SELECT sla_estado FROM ot WHERE id = @0`, [ot.id]);
    expect(fila!.sla_estado).toBe("en_plazo"); // nunca se tocó
    expect(await contarNotificaciones(ot.id, "sla_vencida")).toBe(0);
  });

  it("un ticket pausado (esperando_cliente) no se evalúa: la pausa también congela el estado", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_job3");
    const t = await crearTicketApi(admin.auth, { prioridad: "alta" });
    await request(app).post(`${API}/tickets/${t.id}/tomar`).set("Authorization", admin.auth);
    await request(app).post(`${API}/tickets/${t.id}/estado`).set("Authorization", admin.auth).send({ estado: "esperando_cliente" });

    await AppDataSource.query(`UPDATE ticket SET sla_respuesta_vence_en = @0 WHERE id = @1`, [HACE_MUCHO.toISOString(), t.id]);
    await evaluarSla();

    const [fila]: Array<{ sla_estado: string }> = await AppDataSource.query(`SELECT sla_estado FROM ticket WHERE id = @0`, [t.id]);
    expect(fila!.sla_estado).toBe("en_plazo"); // congelado mientras dura la pausa
  });

  it("antes de la primera respuesta usa slaRespuestaVenceEn; después, slaResolucionVenceEn", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_job4");
    const t = await crearTicketApi(admin.auth, { prioridad: "alta" });
    await request(app).post(`${API}/tickets/${t.id}/tomar`).set("Authorization", admin.auth);

    // slaRespuestaVenceEn vencido, slaResolucionVenceEn sano: como aún no hay primera respuesta,
    // el job debe usar el de respuesta y marcar vencida.
    await AppDataSource.query(`UPDATE ticket SET sla_respuesta_vence_en = @0 WHERE id = @1`, [HACE_MUCHO.toISOString(), t.id]);
    await evaluarSla();
    let [fila]: Array<{ sla_estado: string }> = await AppDataSource.query(`SELECT sla_estado FROM ticket WHERE id = @0`, [t.id]);
    expect(fila!.sla_estado).toBe("vencida");

    // Llega la primera respuesta: la fase cambia a resolución, que sigue sana -> vuelve a en_plazo.
    const res = await request(app)
      .post(`${API}/tickets/${t.id}/mensajes`)
      .set("Authorization", admin.auth)
      .send({ tipo: "respuesta_cliente", cuerpo: "Ya estamos viendo tu caso" });
    expect(res.status).toBe(201);

    await evaluarSla();
    [fila] = await AppDataSource.query(`SELECT sla_estado FROM ticket WHERE id = @0`, [t.id]);
    expect(fila!.sla_estado).toBe("en_plazo");
  });
});
