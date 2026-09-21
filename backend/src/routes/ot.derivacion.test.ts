import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { Rol } from "../entities/enums.js";
import { conectarBD, limpiarBD } from "../test/helpers.js";
import { API, crearEscenario, crearSesionNombrada } from "../test/otHelpers.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

const MOTIVO = "Se requiere otra especialidad";
const derivar = (auth: string, otId: string, body: object) =>
  request(app).post(`${API}/ots/${otId}/derivar`).set("Authorization", auth).send(body);
const detalle = async (auth: string, otId: string) => (await request(app).get(`${API}/ots/${otId}`).set("Authorization", auth)).body.data;

async function tramos(otId: string) {
  return (await AppDataSource.query(
    `SELECT usuario_id, desde, hasta, duracion_seg, motivo_entrada, derivado_por_id
     FROM asignacion WHERE entidad_tipo = 'ot' AND entidad_id = @0 ORDER BY desde`,
    [otId],
  )) as Array<{ usuario_id: string; desde: Date; hasta: Date | null; duracion_seg: number | null; motivo_entrada: string | null; derivado_por_id: string | null }>;
}

async function invariantes(otId: string) {
  const ts = await tramos(otId);
  const abiertos = ts.filter((t) => t.hasta === null);
  const [ot] = await AppDataSource.query(`SELECT responsable_actual_id FROM ot WHERE id = @0`, [otId]);
  expect(abiertos).toHaveLength(1); // nunca 0 ni 2 tramos abiertos
  expect(ot.responsable_actual_id).not.toBeNull(); // nunca sin responsable
  expect(String(ot.responsable_actual_id).toLowerCase()).toBe(abiertos[0]!.usuario_id.toLowerCase());
  // cadena continua: cada tramo cierra exactamente cuando empieza el siguiente
  for (let i = 0; i < ts.length - 1; i++) expect(ts[i]!.hasta!.getTime()).toBe(ts[i + 1]!.desde.getTime());
  return ts;
}

describe("POST /ots/:id/derivar", () => {
  it("cierra el tramo, abre el nuevo, actualiza el responsable, registra evento y notificación; el SLA no se toca", async () => {
    const e = await crearEscenario();
    const antes = (await AppDataSource.query(`SELECT sla_estado, sla_resolucion_vence_en, sla_pausado_desde FROM ot WHERE id = @0`, [e.otId]))[0];

    const res = await derivar(e.resp.auth, e.otId, { destinoId: e.extra.usuario.id, motivo: MOTIVO });

    expect(res.status).toBe(200);
    expect(res.body.data.responsable.id).toBe(e.extra.usuario.id);
    const cadena = res.body.data.cadenaResponsables;
    expect(cadena).toHaveLength(2);
    expect(cadena[0]).toMatchObject({ usuario: { id: e.resp.usuario.id }, actual: false, motivoEntrada: null, derivadoPor: null });
    expect(cadena[0].hasta).toBe(cadena[1].desde);
    expect(cadena[0].duracionSeg).toBeGreaterThanOrEqual(0);
    expect(cadena[1]).toMatchObject({
      usuario: { id: e.extra.usuario.id },
      actual: true,
      hasta: null,
      motivoEntrada: MOTIVO,
      derivadoPor: { id: e.resp.usuario.id },
    });
    await invariantes(e.otId);

    const eventos = res.body.data.eventos;
    expect(eventos[0]).toMatchObject({ tipo: "derivado", actor: { id: e.resp.usuario.id } });
    expect(eventos[0].payload).toEqual({ de: e.resp.usuario.id, a: e.extra.usuario.id, motivo: MOTIVO, mantuvoComoColaborador: false });

    const notifs = await AppDataSource.query(`SELECT usuario_id, tipo, entidad_tipo, entidad_id, leida_en FROM notificacion`);
    expect(notifs).toHaveLength(1);
    expect(String(notifs[0].usuario_id).toLowerCase()).toBe(e.extra.usuario.id);
    expect(notifs[0]).toMatchObject({ tipo: "derivacion", entidad_tipo: "ot", leida_en: null });

    const despues = (await AppDataSource.query(`SELECT sla_estado, sla_resolucion_vence_en, sla_pausado_desde FROM ot WHERE id = @0`, [e.otId]))[0];
    expect(despues).toEqual(antes);
  });

  it("admin y gestion pueden derivar aunque no sean el responsable", async () => {
    const e = await crearEscenario();

    const a = await derivar(e.admin.auth, e.otId, { destinoId: e.extra.usuario.id, motivo: MOTIVO });
    const b = await derivar(e.gestion.auth, e.otId, { destinoId: e.ajeno.usuario.id, motivo: MOTIVO });

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(b.body.data.cadenaResponsables[2].derivadoPor.id).toBe(e.gestion.usuario.id);
    await invariantes(e.otId);
  });

  it("un tecnico que no es el responsable actual recibe 403 (colaborador incluido) y nada cambia", async () => {
    const e = await crearEscenario();

    const colab = await derivar(e.colab.auth, e.otId, { destinoId: e.extra.usuario.id, motivo: MOTIVO });
    const ajeno = await derivar(e.ajeno.auth, e.otId, { destinoId: e.extra.usuario.id, motivo: MOTIVO });
    const lectura = await derivar(e.lectura.auth, e.otId, { destinoId: e.extra.usuario.id, motivo: MOTIVO });

    expect([colab.status, ajeno.status, lectura.status]).toEqual([403, 403, 403]);
    expect(colab.body.code).toBe("PERMISO_DENEGADO");
    expect(await tramos(e.otId)).toHaveLength(1);
    expect(await AppDataSource.query(`SELECT 1 FROM notificacion`)).toHaveLength(0);
  });

  it("tras derivar, quien era responsable ya no puede derivar", async () => {
    const e = await crearEscenario();
    await derivar(e.resp.auth, e.otId, { destinoId: e.extra.usuario.id, motivo: MOTIVO });

    const res = await derivar(e.resp.auth, e.otId, { destinoId: e.ajeno.usuario.id, motivo: MOTIVO });

    expect(res.status).toBe(403);
  });

  it.each([
    ["motivo de 9 caracteres", { motivo: "123456789" }],
    ["motivo ausente", { motivo: undefined }],
    ["motivo solo espacios", { motivo: "              " }],
  ])("400 con %s", async (_n, extra) => {
    const e = await crearEscenario();

    const res = await derivar(e.resp.auth, e.otId, { destinoId: e.extra.usuario.id, ...extra });

    expect(res.status).toBe(400);
    expect(await tramos(e.otId)).toHaveLength(1);
  });

  it("destino igual al responsable actual: 400 DERIVACION_INVALIDA", async () => {
    const e = await crearEscenario();

    const res = await derivar(e.resp.auth, e.otId, { destinoId: e.resp.usuario.id, motivo: MOTIVO });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("DERIVACION_INVALIDA");
  });

  it("destino inactivo, sistema o inexistente: 400 DERIVACION_INVALIDA", async () => {
    const e = await crearEscenario();
    const inactivo = await crearSesionNombrada(Rol.TECNICO, "inactivo_t", { activo: false });
    const sistema = await crearSesionNombrada(Rol.TECNICO, "sistema");

    for (const destinoId of [inactivo.usuario.id, sistema.usuario.id, "11111111-1111-4111-8111-111111111111"]) {
      const res = await derivar(e.resp.auth, e.otId, { destinoId, motivo: MOTIVO });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("DERIVACION_INVALIDA");
    }
    expect(await tramos(e.otId)).toHaveLength(1);
  });

  it("OT inexistente: 404", async () => {
    const e = await crearEscenario();

    const res = await derivar(e.admin.auth, "11111111-1111-4111-8111-111111111111", { destinoId: e.extra.usuario.id, motivo: MOTIVO });

    expect(res.status).toBe(404);
  });

  it("N derivaciones, incluso de vuelta a un responsable previo: cadena coherente", async () => {
    const e = await crearEscenario();
    const ruta = [e.extra, e.ajeno, e.resp, e.extra]; // resp → extra → ajeno → resp → extra
    let actual = e.resp;
    for (const destino of ruta) {
      const res = await derivar(actual.auth, e.otId, { destinoId: destino.usuario.id, motivo: `Pasa a ${destino.usuario.username} ok` });
      expect(res.status).toBe(200);
      actual = destino;
    }

    const ts = await invariantes(e.otId);
    expect(ts.map((t) => t.usuario_id.toLowerCase())).toEqual(
      [e.resp, e.extra, e.ajeno, e.resp, e.extra].map((s) => s.usuario.id),
    );
    expect(ts.slice(0, -1).every((t) => t.duracion_seg !== null && t.duracion_seg >= 0)).toBe(true);
    expect(ts.at(-1)!.duracion_seg).toBeNull();
    const d = await detalle(e.admin.auth, e.otId);
    expect(d.cadenaResponsables.filter((t: { actual: boolean }) => t.actual)).toHaveLength(1);
    expect(d.cadenaResponsables.map((t: { motivoEntrada: string | null }) => t.motivoEntrada)[0]).toBeNull();
  });

  it("mantenerComoColaborador: el responsable anterior pasa a colaborador", async () => {
    const e = await crearEscenario();

    const res = await derivar(e.resp.auth, e.otId, { destinoId: e.extra.usuario.id, motivo: MOTIVO, mantenerComoColaborador: true });

    expect(res.status).toBe(200);
    const ids = res.body.data.colaboradores.map((c: { id: string }) => c.id).sort();
    expect(ids).toEqual([e.colab.usuario.id, e.resp.usuario.id].sort());
    expect(res.body.data.eventos[0].payload.mantuvoComoColaborador).toBe(true);
  });

  it("un colaborador promovido a responsable deja de ser colaborador", async () => {
    const e = await crearEscenario();

    const res = await derivar(e.resp.auth, e.otId, { destinoId: e.colab.usuario.id, motivo: MOTIVO });

    expect(res.status).toBe(200);
    expect(res.body.data.responsable.id).toBe(e.colab.usuario.id);
    expect(res.body.data.colaboradores).toEqual([]);
  });

  it("volver a derivar al anterior que quedó como colaborador lo saca de colaboradores", async () => {
    const e = await crearEscenario();
    await derivar(e.resp.auth, e.otId, { destinoId: e.extra.usuario.id, motivo: MOTIVO, mantenerComoColaborador: true });

    const res = await derivar(e.extra.auth, e.otId, { destinoId: e.resp.usuario.id, motivo: MOTIVO });

    expect(res.status).toBe(200);
    expect(res.body.data.colaboradores.map((c: { id: string }) => c.id)).toEqual([e.colab.usuario.id]);
    await invariantes(e.otId);
  });

  it("dos derivaciones concurrentes: exactamente una gana y la otra recibe 409; nunca 2 tramos abiertos", async () => {
    for (let ronda = 0; ronda < 3; ronda++) {
      await limpiarBD();
      const e = await crearEscenario();

      const [a, b] = await Promise.all([
        derivar(e.admin.auth, e.otId, { destinoId: e.extra.usuario.id, motivo: MOTIVO }),
        derivar(e.gestion.auth, e.otId, { destinoId: e.ajeno.usuario.id, motivo: MOTIVO }),
      ]);

      expect([a.status, b.status].sort()).toEqual([200, 409]);
      const perdedor = a.status === 409 ? a : b;
      expect(perdedor.body.code).toBe("CONFLICTO_CONCURRENCIA");
      const ts = await invariantes(e.otId);
      expect(ts).toHaveLength(2);
      expect(await AppDataSource.query(`SELECT 1 FROM notificacion`)).toHaveLength(1); // la perdedora no dejó nada
    }
  });

  it("varias derivaciones concurrentes: una gana, el resto 409, sin tramos abiertos de más", async () => {
    const e = await crearEscenario();
    const destinos = [e.extra, e.ajeno, e.colab, e.lectura].slice(0, 3);

    const res = await Promise.all(destinos.map((d) => derivar(e.admin.auth, e.otId, { destinoId: d.usuario.id, motivo: MOTIVO })));

    const ok = res.filter((r) => r.status === 200).length;
    expect(ok).toBeGreaterThanOrEqual(1);
    expect(res.filter((r) => r.status !== 200).every((r) => r.status === 409)).toBe(true);
    const ts = await invariantes(e.otId);
    expect(ts).toHaveLength(1 + ok);
  });
});
