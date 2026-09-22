import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { conectarBD, limpiarBD } from "../test/helpers.js";
import { API, crearSesionNombrada } from "../test/otHelpers.js";
import { crearTicketApi, tramosTicket } from "../test/ticketHelpers.js";
import { Rol } from "../entities/enums.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

const tomar = (auth: string, ticketId: string) => request(app).post(`${API}/tickets/${ticketId}/tomar`).set("Authorization", auth);

describe("POST /tickets/:id/tomar", () => {
  it("abre el primer tramo con motivo_entrada y derivado_por_id NULL, actualiza responsable y registra evento 'tomado'", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_tomar");
    const tecnico = await crearSesionNombrada(Rol.TECNICO, "tecnico_tomar");
    const t = await crearTicketApi(admin.auth);

    const res = await tomar(tecnico.auth, t.id);

    expect(res.status).toBe(200);
    expect(res.body.data.responsable).toEqual({ id: tecnico.usuario.id, nombre: tecnico.usuario.nombre });
    const tramos = await tramosTicket(t.id);
    expect(tramos).toHaveLength(1);
    expect(tramos[0]).toMatchObject({ motivo_entrada: null, derivado_por_id: null, hasta: null });
    expect(tramos[0]!.usuario_id.toLowerCase()).toBe(tecnico.usuario.id);

    const ev = await AppDataSource.query(`SELECT tipo, payload FROM evento WHERE entidad_tipo = 'ticket' AND tipo = 'tomado'`);
    expect(ev).toHaveLength(1);
    expect(JSON.parse(ev[0].payload)).toEqual({ usuarioId: tecnico.usuario.id });
  });

  it("409 TICKET_YA_ASIGNADO si ya tiene responsable", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_tomar2");
    const t1 = await crearSesionNombrada(Rol.TECNICO, "t1_tomar2");
    const t2 = await crearSesionNombrada(Rol.TECNICO, "t2_tomar2");
    const t = await crearTicketApi(admin.auth);
    await tomar(t1.auth, t.id);

    const res = await tomar(t2.auth, t.id);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("TICKET_YA_ASIGNADO");
    expect(await tramosTicket(t.id)).toHaveLength(1);
  });

  it("dos tomas simultáneas sobre el mismo ticket: exactamente una gana, la otra 409", async () => {
    for (let ronda = 0; ronda < 3; ronda++) {
      await limpiarBD();
      const admin = await crearSesionNombrada(Rol.ADMIN, "admin_conc");
      const t1 = await crearSesionNombrada(Rol.TECNICO, "t1_conc");
      const t2 = await crearSesionNombrada(Rol.TECNICO, "t2_conc");
      const t = await crearTicketApi(admin.auth);

      const [a, b] = await Promise.all([tomar(t1.auth, t.id), tomar(t2.auth, t.id)]);

      expect([a.status, b.status].sort()).toEqual([200, 409]);
      const tramos = await tramosTicket(t.id);
      expect(tramos).toHaveLength(1);
      const [ticketRow] = await AppDataSource.query(`SELECT responsable_actual_id FROM ticket WHERE id = @0`, [t.id]);
      expect(String(ticketRow.responsable_actual_id).toLowerCase()).toBe(tramos[0]!.usuario_id.toLowerCase());
    }
  });

  it("lectura no puede tomar: 403", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_tomar3");
    const lectura = await crearSesionNombrada(Rol.LECTURA, "lectura_tomar3");
    const t = await crearTicketApi(admin.auth);

    const res = await tomar(lectura.auth, t.id);

    expect(res.status).toBe(403);
  });

  it("ticket inexistente: 404", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_tomar4");

    const res = await tomar(admin.auth, "11111111-1111-4111-8111-111111111111");

    expect(res.status).toBe(404);
  });
});
