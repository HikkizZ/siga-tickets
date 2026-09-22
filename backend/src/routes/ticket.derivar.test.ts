import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { Rol } from "../entities/enums.js";
import { conectarBD, limpiarBD } from "../test/helpers.js";
import { API, crearSesionNombrada } from "../test/otHelpers.js";
import { crearEscenarioTicket, tramosTicket } from "../test/ticketHelpers.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

const MOTIVO = "Se requiere otra especialidad";
const derivar = (auth: string, id: string, body: object) => request(app).post(`${API}/tickets/${id}/derivar`).set("Authorization", auth).send(body);
const detalle = async (auth: string, id: string) => (await request(app).get(`${API}/tickets/${id}`).set("Authorization", auth)).body.data;

async function invariantes(ticketId: string) {
  const ts = await tramosTicket(ticketId);
  const abiertos = ts.filter((t) => t.hasta === null);
  const [t] = await AppDataSource.query(`SELECT responsable_actual_id FROM ticket WHERE id = @0`, [ticketId]);
  expect(abiertos).toHaveLength(1);
  expect(t.responsable_actual_id).not.toBeNull();
  expect(String(t.responsable_actual_id).toLowerCase()).toBe(abiertos[0]!.usuario_id.toLowerCase());
  for (let i = 0; i < ts.length - 1; i++) expect(ts[i]!.hasta!.getTime()).toBe(ts[i + 1]!.desde.getTime());
  return ts;
}

describe("POST /tickets/:id/derivar", () => {
  it("cierra el tramo, abre el nuevo, actualiza el responsable y registra evento (sin mantenerComoColaborador)", async () => {
    const e = await crearEscenarioTicket();

    const res = await derivar(e.resp.auth, e.ticketId, { destinoId: e.extra.usuario.id, motivo: MOTIVO });

    expect(res.status).toBe(200);
    expect(res.body.data.responsable.id).toBe(e.extra.usuario.id);
    const cadena = res.body.data.cadenaResponsables;
    expect(cadena).toHaveLength(2);
    expect(cadena[1]).toMatchObject({ usuario: { id: e.extra.usuario.id }, actual: true, hasta: null, motivoEntrada: MOTIVO, derivadoPor: { id: e.resp.usuario.id } });
    await invariantes(e.ticketId);

    const ev = res.body.data.eventos;
    expect(ev[0]).toMatchObject({ tipo: "derivado", actor: { id: e.resp.usuario.id } });
    expect(ev[0].payload).toEqual({ de: e.resp.usuario.id, a: e.extra.usuario.id, motivo: MOTIVO });

    const notifs = await AppDataSource.query(`SELECT usuario_id, tipo, entidad_tipo, entidad_id FROM notificacion`);
    expect(notifs).toHaveLength(1);
    expect(notifs[0]).toMatchObject({ tipo: "derivacion", entidad_tipo: "ticket" });
  });

  it("no acepta mantenerComoColaborador (el ticket no tiene colaboradores): 400", async () => {
    const e = await crearEscenarioTicket();

    const res = await derivar(e.resp.auth, e.ticketId, { destinoId: e.extra.usuario.id, motivo: MOTIVO, mantenerComoColaborador: true });

    expect(res.status).toBe(400);
  });

  it("admin y gestion pueden derivar aunque no sean el responsable", async () => {
    const e = await crearEscenarioTicket();

    const a = await derivar(e.admin.auth, e.ticketId, { destinoId: e.extra.usuario.id, motivo: MOTIVO });

    expect(a.status).toBe(200);
    await invariantes(e.ticketId);
  });

  it("un tecnico que no es el responsable actual recibe 403", async () => {
    const e = await crearEscenarioTicket();

    const res = await derivar(e.ajeno.auth, e.ticketId, { destinoId: e.extra.usuario.id, motivo: MOTIVO });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PERMISO_DENEGADO");
    expect(await tramosTicket(e.ticketId)).toHaveLength(1);
  });

  it.each([
    ["motivo de 9 caracteres", { motivo: "123456789" }],
    ["motivo ausente", { motivo: undefined }],
  ])("400 con %s", async (_n, extra) => {
    const e = await crearEscenarioTicket();

    const res = await derivar(e.resp.auth, e.ticketId, { destinoId: e.extra.usuario.id, ...extra });

    expect(res.status).toBe(400);
  });

  it("destino igual al responsable actual: 400 DERIVACION_INVALIDA", async () => {
    const e = await crearEscenarioTicket();

    const res = await derivar(e.resp.auth, e.ticketId, { destinoId: e.resp.usuario.id, motivo: MOTIVO });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("DERIVACION_INVALIDA");
  });

  it("destino inactivo o inexistente: 400 DERIVACION_INVALIDA", async () => {
    const e = await crearEscenarioTicket();
    const inactivo = await crearSesionNombrada(Rol.TECNICO, "inactivo_tk", { activo: false });

    for (const destinoId of [inactivo.usuario.id, "11111111-1111-4111-8111-111111111111"]) {
      const res = await derivar(e.resp.auth, e.ticketId, { destinoId, motivo: MOTIVO });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("DERIVACION_INVALIDA");
    }
  });

  it("ticket inexistente: 404", async () => {
    const e = await crearEscenarioTicket();

    const res = await derivar(e.admin.auth, "11111111-1111-4111-8111-111111111111", { destinoId: e.extra.usuario.id, motivo: MOTIVO });

    expect(res.status).toBe(404);
  });

  it("N derivaciones: cadena coherente", async () => {
    const e = await crearEscenarioTicket();
    const ruta = [e.extra, e.ajeno, e.resp];
    let actual = e.resp;
    for (const destino of ruta) {
      const res = await derivar(actual.auth, e.ticketId, { destinoId: destino.usuario.id, motivo: `Pasa a ${destino.usuario.username} ok` });
      expect(res.status).toBe(200);
      actual = destino;
    }

    const ts = await invariantes(e.ticketId);
    expect(ts.map((t) => t.usuario_id.toLowerCase())).toEqual([e.resp, e.extra, e.ajeno, e.resp].map((s) => s.usuario.id));
    const d = await detalle(e.admin.auth, e.ticketId);
    expect(d.cadenaResponsables.filter((t: { actual: boolean }) => t.actual)).toHaveLength(1);
  });

  it("dos derivaciones concurrentes: exactamente una gana, la otra 409", async () => {
    for (let ronda = 0; ronda < 3; ronda++) {
      await limpiarBD();
      const e = await crearEscenarioTicket();

      const [a, b] = await Promise.all([
        derivar(e.admin.auth, e.ticketId, { destinoId: e.extra.usuario.id, motivo: MOTIVO }),
        derivar(e.gestion.auth, e.ticketId, { destinoId: e.ajeno.usuario.id, motivo: MOTIVO }),
      ]);

      expect([a.status, b.status].sort()).toEqual([200, 409]);
      const perdedor = a.status === 409 ? a : b;
      expect(perdedor.body.code).toBe("CONFLICTO_CONCURRENCIA");
      const ts = await invariantes(e.ticketId);
      expect(ts).toHaveLength(2);
    }
  });
});
