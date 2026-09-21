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

const req = (metodo: "get" | "post" | "patch" | "delete", auth: string, url: string, body?: object) => {
  const r = request(app)[metodo](`${API}${url}`).set("Authorization", auth);
  return body ? r.send(body) : r;
};

async function tiposEvento(otId: string) {
  const filas = await AppDataSource.query(`SELECT tipo FROM evento WHERE entidad_id = @0 ORDER BY id`, [otId]);
  return filas.map((f: { tipo: string }) => f.tipo);
}

describe("colaboradores", () => {
  it("el responsable agrega y quita; genera eventos", async () => {
    const e = await crearEscenario();

    const add = await req("post", e.resp.auth, `/ots/${e.otId}/colaboradores`, { usuarioId: e.extra.usuario.id });
    const del = await req("delete", e.resp.auth, `/ots/${e.otId}/colaboradores/${e.extra.usuario.id}`);

    expect(add.status).toBe(201);
    expect(add.body.data.map((c: { id: string }) => c.id)).toContain(e.extra.usuario.id);
    expect(del.status).toBe(200);
    expect((await tiposEvento(e.otId)).slice(1)).toEqual(["colaborador_agregado", "colaborador_quitado"]);
  });

  it("no se puede agregar al responsable actual, a un inactivo ni a `sistema`", async () => {
    const e = await crearEscenario();
    const inactivo = await crearSesionNombrada(Rol.TECNICO, "inactivo_t", { activo: false });
    const sistema = await crearSesionNombrada(Rol.TECNICO, "sistema");

    for (const id of [e.resp.usuario.id, inactivo.usuario.id, sistema.usuario.id, "11111111-1111-4111-8111-111111111111"]) {
      const res = await req("post", e.admin.auth, `/ots/${e.otId}/colaboradores`, { usuarioId: id });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("COLABORADOR_INVALIDO");
    }
  });

  it("duplicado: 409 COLABORADOR_DUPLICADO", async () => {
    const e = await crearEscenario();

    const res = await req("post", e.admin.auth, `/ots/${e.otId}/colaboradores`, { usuarioId: e.colab.usuario.id });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("COLABORADOR_DUPLICADO");
  });

  it("quitar a quien no es colaborador: 404", async () => {
    const e = await crearEscenario();

    const res = await req("delete", e.admin.auth, `/ots/${e.otId}/colaboradores/${e.extra.usuario.id}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("COLABORADOR_NO_ENCONTRADO");
  });
});

describe("colaboradores: auto-inclusión", () => {
  const url = (otId: string) => `/ots/${otId}/colaboradores`;

  it("un tecnico ajeno se añade a sí mismo: 201, aparece en el detalle y genera evento con él como actor", async () => {
    const e = await crearEscenario();

    const res = await req("post", e.ajeno.auth, url(e.otId), { usuarioId: e.ajeno.usuario.id });
    const detalle = await req("get", e.lectura.auth, `/ots/${e.otId}`);

    expect(res.status).toBe(201);
    expect(res.body.data.map((c: { id: string }) => c.id)).toContain(e.ajeno.usuario.id);
    expect(detalle.body.data.colaboradores.map((c: { id: string }) => c.id)).toContain(e.ajeno.usuario.id);
    const ev = await AppDataSource.query(
      `SELECT actor_id, payload FROM evento WHERE entidad_id = @0 AND tipo = 'colaborador_agregado'`,
      [e.otId],
    );
    expect(ev).toHaveLength(1);
    expect(String(ev[0].actor_id).toLowerCase()).toBe(e.ajeno.usuario.id);
    expect(JSON.parse(ev[0].payload).usuarioId).toBe(e.ajeno.usuario.id);
  });

  it("un tecnico ajeno que añade a otro: 403", async () => {
    const e = await crearEscenario();
    const res = await req("post", e.ajeno.auth, url(e.otId), { usuarioId: e.extra.usuario.id });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PERMISO_DENEGADO");
  });

  it("lectura no puede, ni siquiera a sí mismo: 403", async () => {
    const e = await crearEscenario();
    const res = await req("post", e.lectura.auth, url(e.otId), { usuarioId: e.lectura.usuario.id });
    expect(res.status).toBe(403);
  });

  it.each(["resp", "gestion", "admin"] as const)("%s añade a otro: 201", async (quien) => {
    const e = await crearEscenario();
    const res = await req("post", e[quien].auth, url(e.otId), { usuarioId: e.ajeno.usuario.id });
    expect(res.status).toBe(201);
  });

  it("auto-añadirse dos veces: 409; un colaborador que ya lo es también", async () => {
    const e = await crearEscenario();
    const a = await req("post", e.ajeno.auth, url(e.otId), { usuarioId: e.ajeno.usuario.id });
    const b = await req("post", e.ajeno.auth, url(e.otId), { usuarioId: e.ajeno.usuario.id });
    expect(a.status).toBe(201);
    expect(b.status).toBe(409);
    expect(b.body.code).toBe("COLABORADOR_DUPLICADO");
  });

  it("el responsable actual intentando añadirse: 400 COLABORADOR_INVALIDO", async () => {
    const e = await crearEscenario();
    const res = await req("post", e.resp.auth, url(e.otId), { usuarioId: e.resp.usuario.id });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("COLABORADOR_INVALIDO");
  });

  it("un tecnico ajeno no puede añadir a un usuario inactivo (403 por no ser él mismo)", async () => {
    const e = await crearEscenario();
    const inactivo = await crearSesionNombrada(Rol.TECNICO, "inactivo_t", { activo: false });
    const res = await req("post", e.ajeno.auth, url(e.otId), { usuarioId: inactivo.usuario.id });
    expect(res.status).toBe(403);
  });

  it("un tecnico ajeno no puede quitar colaboradores: 403", async () => {
    const e = await crearEscenario();
    const res = await req("delete", e.ajeno.auth, `${url(e.otId)}/${e.colab.usuario.id}`);
    expect(res.status).toBe(403);
  });
});

describe("comentarios", () => {
  it("interno por defecto; visibleCliente explícito; evento sin copiar el texto", async () => {
    const e = await crearEscenario();

    const a = await req("post", e.colab.auth, `/ots/${e.otId}/comentarios`, { cuerpo: "Nota interna" });
    const b = await req("post", e.resp.auth, `/ots/${e.otId}/comentarios`, { cuerpo: "Para el cliente", visibleCliente: true });
    const lista = await req("get", e.lectura.auth, `/ots/${e.otId}/comentarios`);

    expect(a.status).toBe(201);
    expect(a.body.data).toMatchObject({ cuerpo: "Nota interna", visibleCliente: false, autor: { id: e.colab.usuario.id } });
    expect(b.body.data.visibleCliente).toBe(true);
    expect(lista.body.data.map((c: { cuerpo: string }) => c.cuerpo)).toEqual(["Para el cliente", "Nota interna"]);
    const payloads = await AppDataSource.query(`SELECT payload FROM evento WHERE tipo = 'comentario'`);
    expect(JSON.stringify(payloads)).not.toContain("Nota interna");
  });

  it("cuerpo vacío: 400", async () => {
    const e = await crearEscenario();
    expect((await req("post", e.resp.auth, `/ots/${e.otId}/comentarios`, { cuerpo: "  " })).status).toBe(400);
  });
});

describe("horas", () => {
  const hora = (extra: object = {}) => ({ fecha: "2026-09-01", horas: 2, detalle: "Trabajo", ...extra });

  it("registra, acumula el total y genera evento", async () => {
    const e = await crearEscenario();

    const a = await req("post", e.resp.auth, `/ots/${e.otId}/horas`, hora({ horas: 1.5 }));
    const b = await req("post", e.colab.auth, `/ots/${e.otId}/horas`, hora({ horas: 0.25 }));
    const lista = await req("get", e.lectura.auth, `/ots/${e.otId}/horas`);

    expect(a.status).toBe(201);
    expect(a.body.data.hora).toMatchObject({ horas: 1.5, fecha: "2026-09-01", usuario: { id: e.resp.usuario.id } });
    expect(a.body.data.total).toBe(1.5);
    expect(b.body.data.total).toBe(1.75);
    expect(lista.body.data.total).toBe(1.75);
    expect(lista.body.data.items).toHaveLength(2);
    expect((await tiposEvento(e.otId)).slice(1)).toEqual(["horas_registradas", "horas_registradas"]);
  });

  it.each([
    ["0", 0],
    ["negativo", -1],
    ["más de 24", 24.5],
    ["3 decimales", 1.234],
    ["texto", "2"],
  ])("horas inválidas (%s): 400", async (_n, horas) => {
    const e = await crearEscenario();
    const res = await req("post", e.resp.auth, `/ots/${e.otId}/horas`, hora({ horas: horas as number }));
    expect(res.status).toBe(400);
  });

  it("límites válidos: 24 y 0.01", async () => {
    const e = await crearEscenario();
    const a = await req("post", e.resp.auth, `/ots/${e.otId}/horas`, hora({ horas: 24 }));
    const b = await req("post", e.resp.auth, `/ots/${e.otId}/horas`, hora({ horas: 0.01 }));
    expect(a.status).toBe(201);
    expect(b.body.data.total).toBe(24.01);
  });

  it("fecha inválida: 400", async () => {
    const e = await crearEscenario();
    expect((await req("post", e.resp.auth, `/ots/${e.otId}/horas`, hora({ fecha: "2026-13-01" }))).status).toBe(400);
  });

  it("un tecnico no puede registrar horas de otro; gestion/admin sí (usuarioId)", async () => {
    const e = await crearEscenario();

    const tec = await req("post", e.resp.auth, `/ots/${e.otId}/horas`, hora({ usuarioId: e.colab.usuario.id }));
    const gestion = await req("post", e.gestion.auth, `/ots/${e.otId}/horas`, hora({ usuarioId: e.colab.usuario.id }));
    const inactivo = await crearSesionNombrada(Rol.TECNICO, "inactivo_t", { activo: false });
    const aInactivo = await req("post", e.admin.auth, `/ots/${e.otId}/horas`, hora({ usuarioId: inactivo.usuario.id }));

    expect(tec.status).toBe(403);
    expect(gestion.status).toBe(201);
    expect(gestion.body.data.hora.usuario.id).toBe(e.colab.usuario.id);
    expect(aInactivo.status).toBe(400);
  });

  it("un tecnico ajeno a la OT: 403 al registrar horas, con mensaje claro", async () => {
    const e = await crearEscenario();
    const res = await req("post", e.ajeno.auth, `/ots/${e.otId}/horas`, hora());
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PERMISO_DENEGADO");
    expect(res.body.message ?? res.body.error ?? JSON.stringify(res.body)).toMatch(/responsable o colaborador/);
  });

  it("gestion/admin registran horas a nombre de otro sin ser colaboradores", async () => {
    const e = await crearEscenario();
    const g = await req("post", e.gestion.auth, `/ots/${e.otId}/horas`, hora({ usuarioId: e.ajeno.usuario.id }));
    const a = await req("post", e.admin.auth, `/ots/${e.otId}/horas`, hora({ usuarioId: e.extra.usuario.id }));
    expect(g.status).toBe(201);
    expect(g.body.data.hora.usuario.id).toBe(e.ajeno.usuario.id);
    expect(a.status).toBe(201);
    expect(a.body.data.hora.usuario.id).toBe(e.extra.usuario.id);
  });

  it("flujo: ajeno 403 → se suma como colaborador → 201 → lo quitan → 403, y sus horas previas siguen y él las borra", async () => {
    const e = await crearEscenario();
    const horasUrl = `/ots/${e.otId}/horas`;

    expect((await req("post", e.ajeno.auth, horasUrl, hora())).status).toBe(403);
    expect((await req("post", e.ajeno.auth, `/ots/${e.otId}/colaboradores`, { usuarioId: e.ajeno.usuario.id })).status).toBe(201);
    const ok = await req("post", e.ajeno.auth, horasUrl, hora({ horas: 3 }));
    expect(ok.status).toBe(201);

    expect((await req("delete", e.resp.auth, `/ots/${e.otId}/colaboradores/${e.ajeno.usuario.id}`)).status).toBe(200);
    expect((await req("post", e.ajeno.auth, horasUrl, hora())).status).toBe(403);

    const lista = await req("get", e.lectura.auth, horasUrl);
    expect(lista.body.data.items.map((h: { id: string }) => h.id)).toEqual([ok.body.data.hora.id]);
    const del = await req("delete", e.ajeno.auth, `${horasUrl}/${ok.body.data.hora.id}`);
    expect(del.status).toBe(200);
    expect(del.body.data.total).toBe(0);
  });

  it("un tecnico solo borra las suyas; gestion/admin cualquiera; el total baja", async () => {
    const e = await crearEscenario();
    const propia = (await req("post", e.resp.auth, `/ots/${e.otId}/horas`, hora({ horas: 1 }))).body.data.hora.id;
    const ajena = (await req("post", e.colab.auth, `/ots/${e.otId}/horas`, hora({ horas: 2 }))).body.data.hora.id;

    const denegado = await req("delete", e.resp.auth, `/ots/${e.otId}/horas/${ajena}`);
    const ok = await req("delete", e.resp.auth, `/ots/${e.otId}/horas/${propia}`);
    const admin = await req("delete", e.admin.auth, `/ots/${e.otId}/horas/${ajena}`);
    const inexistente = await req("delete", e.admin.auth, `/ots/${e.otId}/horas/${ajena}`);

    expect(denegado.status).toBe(403);
    expect(ok.status).toBe(200);
    expect(ok.body.data.total).toBe(2);
    expect(admin.body.data.total).toBe(0);
    expect(inexistente.status).toBe(404);
    expect(await tiposEvento(e.otId)).toContain("horas_eliminadas");
  });
});

describe("etapas", () => {
  const etapa = (extra: object = {}) => ({ nombre: "Diagnóstico", fechaInicio: "2026-09-01", fechaTermino: "2026-09-05", ...extra });

  it("crea con orden automático al final; respeta un orden explícito; listado ordenado", async () => {
    const e = await crearEscenario();

    const a = await req("post", e.resp.auth, `/ots/${e.otId}/etapas`, etapa({ nombre: "A" }));
    const b = await req("post", e.resp.auth, `/ots/${e.otId}/etapas`, etapa({ nombre: "B" }));
    const c = await req("post", e.resp.auth, `/ots/${e.otId}/etapas`, etapa({ nombre: "C", orden: 10 }));
    const d = await req("post", e.resp.auth, `/ots/${e.otId}/etapas`, etapa({ nombre: "D" }));
    const lista = await req("get", e.lectura.auth, `/ots/${e.otId}/etapas`);

    expect([a.body.data.orden, b.body.data.orden, c.body.data.orden, d.body.data.orden]).toEqual([1, 2, 10, 11]);
    expect(lista.body.data.map((x: { nombre: string }) => x.nombre)).toEqual(["A", "B", "C", "D"]);
    expect(a.body.data).toEqual({ id: expect.any(String), nombre: "A", fechaInicio: "2026-09-01", fechaTermino: "2026-09-05", orden: 1 });
  });

  it("fechas invertidas: 400 en alta y en edición (con una sola fecha se compara con la guardada)", async () => {
    const e = await crearEscenario();
    const alta = await req("post", e.resp.auth, `/ots/${e.otId}/etapas`, etapa({ fechaTermino: "2026-08-31" }));
    const creada = (await req("post", e.resp.auth, `/ots/${e.otId}/etapas`, etapa())).body.data;

    const dos = await req("patch", e.resp.auth, `/ots/${e.otId}/etapas/${creada.id}`, { fechaInicio: "2026-09-10", fechaTermino: "2026-09-09" });
    const una = await req("patch", e.resp.auth, `/ots/${e.otId}/etapas/${creada.id}`, { fechaInicio: "2026-09-06" });

    expect(alta.status).toBe(400);
    expect(dos.status).toBe(400);
    expect(una.status).toBe(400);
    expect(una.body.code).toBe("VALIDATION_ERROR");
  });

  it("edita y elimina con eventos; id ajeno: 404", async () => {
    const e = await crearEscenario();
    const creada = (await req("post", e.resp.auth, `/ots/${e.otId}/etapas`, etapa())).body.data;

    const edit = await req("patch", e.resp.auth, `/ots/${e.otId}/etapas/${creada.id}`, { nombre: "Renombrada", fechaTermino: "2026-09-20" });
    const igual = await req("patch", e.resp.auth, `/ots/${e.otId}/etapas/${creada.id}`, { nombre: "Renombrada" });
    const del = await req("delete", e.resp.auth, `/ots/${e.otId}/etapas/${creada.id}`);
    const otra = await req("delete", e.resp.auth, `/ots/${e.otId}/etapas/${creada.id}`);

    expect(edit.body.data).toMatchObject({ nombre: "Renombrada", fechaTermino: "2026-09-20" });
    expect(igual.status).toBe(200);
    expect(del.status).toBe(200);
    expect(otra.status).toBe(404);
    expect((await tiposEvento(e.otId)).slice(1)).toEqual(["etapa_creada", "etapa_editada", "etapa_eliminada"]);
  });
});
