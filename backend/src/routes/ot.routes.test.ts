import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { Rol } from "../entities/enums.js";
import { conectarBD, limpiarBD, obtenerPrioridadPorNombre } from "../test/helpers.js";
import { API, crearClienteTest, crearEscenario, crearOtApi, crearSesionNombrada, otBody } from "../test/otHelpers.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

const get = (auth: string, url: string) => request(app).get(`${API}${url}`).set("Authorization", auth);
const post = (auth: string, url: string, body: object) => request(app).post(`${API}${url}`).set("Authorization", auth).send(body);
const patch = (auth: string, url: string, body: object) => request(app).patch(`${API}${url}`).set("Authorization", auth).send(body);

async function eventosDe(otId: string) {
  return (await AppDataSource.query(
    `SELECT tipo, actor_id, payload FROM evento WHERE entidad_tipo = 'ot' AND entidad_id = @0 ORDER BY id`,
    [otId],
  )) as Array<{ tipo: string; actor_id: string; payload: string }>;
}

describe("POST /ots", () => {
  it("crea la OT: folio consecutivo, recepcionado_por del token, primer tramo abierto y evento", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_t");
    const tec = await crearSesionNombrada(Rol.TECNICO, "tec_t");
    const cliente = await crearClienteTest();

    const r1 = await post(tec.auth, "/ots", await otBody(cliente.id));
    const r2 = await post(admin.auth, "/ots", await otBody(cliente.id));

    expect(r1.status).toBe(201);
    expect(r1.body.data.numero).toBe("OT-1041");
    expect(r2.body.data.numero).toBe("OT-1042");
    const ot = r1.body.data;
    expect(ot.estado).toBe("ingresado");
    expect(ot.recepcionadoPor).toEqual({ id: tec.usuario.id, nombre: tec.usuario.nombre });
    expect(ot.responsable.id).toBe(tec.usuario.id); // por defecto, el creador
    expect(ot.cadenaResponsables).toHaveLength(1);
    expect(ot.cadenaResponsables[0]).toMatchObject({ usuario: { id: tec.usuario.id }, hasta: null, actual: true, motivoEntrada: null, derivadoPor: null });
    expect(ot.cadenaResponsables[0].desde).toBe(ot.fechaIngreso);
    expect(ot.cotizaciones).toEqual([]);
    expect(ot.tickets).toEqual([]);
    expect(ot.slaEstado).toBe("en_plazo");

    const eventos = await eventosDe(ot.id);
    expect(eventos.map((e) => e.tipo)).toEqual(["creado"]);
    expect(eventos[0]!.actor_id.toLowerCase()).toBe(tec.usuario.id);
    expect(JSON.parse(eventos[0]!.payload)).toMatchObject({ numero: "OT-1041", responsableId: tec.usuario.id });
  });

  it("recepcionadoPorId en el body se rechaza (strict) y no se usa", async () => {
    const tec = await crearSesionNombrada(Rol.TECNICO, "tec_t");
    const otro = await crearSesionNombrada(Rol.TECNICO, "otro_t");
    const cliente = await crearClienteTest();

    const res = await post(tec.auth, "/ots", await otBody(cliente.id, { recepcionadoPorId: otro.usuario.id }));

    expect(res.status).toBe(400);
    expect(await AppDataSource.query("SELECT COUNT(*) AS n FROM ot").then((r) => r[0].n)).toBe(0);
  });

  it("acepta responsable y colaboradores distintos del creador", async () => {
    const e = await crearEscenario();
    const res = await get(e.admin.auth, `/ots/${e.otId}`);

    expect(res.body.data.responsable.id).toBe(e.resp.usuario.id);
    expect(res.body.data.recepcionadoPor.id).toBe(e.admin.usuario.id);
    expect(res.body.data.colaboradores).toEqual([{ id: e.colab.usuario.id, nombre: e.colab.usuario.nombre }]);
  });

  it("OT interna válida: area sin cliente", async () => {
    const tec = await crearSesionNombrada(Rol.TECNICO, "tec_t");

    const res = await post(tec.auth, "/ots", await otBody("", { clienteId: undefined, esInterna: true, areaInterna: "Sistemas" }));

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ esInterna: true, areaInterna: "Sistemas", cliente: null });
  });

  it.each([
    ["interna sin areaInterna", { esInterna: true, clienteId: undefined }],
    ["interna con clienteId", { esInterna: true, areaInterna: "TI" }],
    ["no interna sin clienteId", { clienteId: undefined }],
    ["no interna con areaInterna", { areaInterna: "TI" }],
    ["fecha estimada inexistente", { fechaEstimadaTermino: "2026-02-30" }],
    ["fecha estimada con formato inválido", { fechaEstimadaTermino: "30/02/2026" }],
    ["prioridadId inválido", { prioridadId: "urgente" }],
    ["título vacío", { titulo: "   " }],
  ])("400 (no 500) con %s", async (_n, extra) => {
    const tec = await crearSesionNombrada(Rol.TECNICO, "tec_t");
    const cliente = await crearClienteTest();

    const res = await post(tec.auth, "/ots", await otBody(cliente.id, extra as Record<string, unknown>));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("cliente inexistente o inactivo: 400 CLIENTE_INVALIDO", async () => {
    const tec = await crearSesionNombrada(Rol.TECNICO, "tec_t");
    const inactivo = await crearClienteTest("Inactivo SA", false);

    const a = await post(tec.auth, "/ots", await otBody(inactivo.id));
    const b = await post(tec.auth, "/ots", await otBody("11111111-1111-4111-8111-111111111111"));

    expect(a.status).toBe(400);
    expect(a.body.code).toBe("CLIENTE_INVALIDO");
    expect(b.body.code).toBe("CLIENTE_INVALIDO");
  });

  it("responsable inactivo o sistema: 400; y un rechazo no consume folio", async () => {
    const tec = await crearSesionNombrada(Rol.TECNICO, "tec_t");
    const inactivo = await crearSesionNombrada(Rol.TECNICO, "inactivo_t", { activo: false });
    const sistema = await crearSesionNombrada(Rol.TECNICO, "sistema", { activo: true });
    const cliente = await crearClienteTest();

    const a = await post(tec.auth, "/ots", await otBody(cliente.id, { responsableId: inactivo.usuario.id }));
    const b = await post(tec.auth, "/ots", await otBody(cliente.id, { responsableId: sistema.usuario.id }));
    const ok = await post(tec.auth, "/ots", await otBody(cliente.id));

    expect(a.status).toBe(400);
    expect(b.status).toBe(400);
    expect(ok.body.data.numero).toBe("OT-1041"); // el rollback también revirtió el folio
  });

  it("colaborador igual al responsable: 400", async () => {
    const tec = await crearSesionNombrada(Rol.TECNICO, "tec_t");
    const cliente = await crearClienteTest();

    const res = await post(tec.auth, "/ots", await otBody(cliente.id, { colaboradorIds: [tec.usuario.id] }));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("COLABORADOR_INVALIDO");
  });
});

describe("POST /ots/:id/estado", () => {
  it("cambia el estado y registra el evento con antes/después", async () => {
    const e = await crearEscenario();

    const res = await post(e.resp.auth, `/ots/${e.otId}/estado`, { estado: "en_ejecucion" });

    expect(res.status).toBe(200);
    expect(res.body.data.estado).toBe("en_ejecucion");
    const ev = (await eventosDe(e.otId)).at(-1)!;
    expect(ev.tipo).toBe("estado_cambiado");
    expect(JSON.parse(ev.payload)).toEqual({ de: "ingresado", a: "en_ejecucion" });
  });

  it("mismo estado: 409 y sin evento nuevo", async () => {
    const e = await crearEscenario();

    const res = await post(e.resp.auth, `/ots/${e.otId}/estado`, { estado: "ingresado" });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ESTADO_SIN_CAMBIO");
    expect(await eventosDe(e.otId)).toHaveLength(1);
  });

  it("estado inválido: 400", async () => {
    const e = await crearEscenario();

    const res = await post(e.resp.auth, `/ots/${e.otId}/estado`, { estado: "cerrado" });

    expect(res.status).toBe(400);
  });

  it("terminado_en se fija una sola vez aunque se retroceda y se vuelva a avanzar", async () => {
    const e = await crearEscenario();
    const leer = async () => (await get(e.admin.auth, `/ots/${e.otId}`)).body.data.terminadoEn as string | null;

    expect(await leer()).toBeNull();
    await post(e.resp.auth, `/ots/${e.otId}/estado`, { estado: "terminado" });
    const primera = await leer();
    expect(primera).not.toBeNull();

    await post(e.resp.auth, `/ots/${e.otId}/estado`, { estado: "en_ejecucion" });
    expect(await leer()).toBe(primera); // retroceder no lo borra
    await new Promise((r) => setTimeout(r, 20));
    await post(e.resp.auth, `/ots/${e.otId}/estado`, { estado: "facturado" });
    expect(await leer()).toBe(primera); // ni lo reescribe al volver a avanzar
  });
});

describe("PATCH /ots/:id", () => {
  it("cambio de prioridad genera prioridad_cambiada; solo lo que cambia genera evento", async () => {
    const e = await crearEscenario();
    const [media, alta] = await Promise.all([obtenerPrioridadPorNombre("Media"), obtenerPrioridadPorNombre("Alta")]);

    const res = await patch(e.resp.auth, `/ots/${e.otId}`, { prioridadId: alta.id, titulo: "Mantención de bomba" });

    expect(res.status).toBe(200);
    expect(res.body.data.prioridad).toEqual({ id: alta.id, nombre: "Alta" });
    const eventos = (await eventosDe(e.otId)).slice(1);
    expect(eventos.map((x) => x.tipo)).toEqual(["prioridad_cambiada"]); // el título es igual: no genera ot_editada
    expect(JSON.parse(eventos[0]!.payload)).toEqual({ de: media.nombre, a: alta.nombre });
  });

  it("edición de campos: ot_editada con la lista de campos cambiados", async () => {
    const e = await crearEscenario();

    const res = await patch(e.resp.auth, `/ots/${e.otId}`, { titulo: "Nuevo título", ubicacion: "Planta 2", fechaEstimadaTermino: "2026-12-31" });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ titulo: "Nuevo título", ubicacion: "Planta 2", fechaEstimadaTermino: "2026-12-31" });
    const ev = (await eventosDe(e.otId)).at(-1)!;
    expect(ev.tipo).toBe("ot_editada");
    expect(JSON.parse(ev.payload).campos.sort()).toEqual(["fechaEstimadaTermino", "titulo", "ubicacion"]);
  });

  it("sin cambios reales: 200 y ningún evento", async () => {
    const e = await crearEscenario();

    const res = await patch(e.resp.auth, `/ots/${e.otId}`, { titulo: "Mantención de bomba" });

    expect(res.status).toBe(200);
    expect(await eventosDe(e.otId)).toHaveLength(1);
  });

  it.each(["recepcionadoPorId", "numero", "estado", "responsableActualId", "responsableId"])("%s no es editable (400)", async (campo) => {
    const e = await crearEscenario();

    const res = await patch(e.admin.auth, `/ots/${e.otId}`, { [campo]: "x" });

    expect(res.status).toBe(400);
  });

  it("respeta el CHECK de interna: clienteId en OT interna y areaInterna en OT con cliente dan 400", async () => {
    const e = await crearEscenario();
    const interna = await crearOtApi(e.admin.auth, e.cliente.id, { clienteId: undefined, esInterna: true, areaInterna: "TI" });

    const a = await patch(e.admin.auth, `/ots/${interna.id}`, { clienteId: e.cliente.id });
    const b = await patch(e.admin.auth, `/ots/${e.otId}`, { areaInterna: "TI" });
    const c = await patch(e.admin.auth, `/ots/${interna.id}`, { areaInterna: "Logística" });
    const otroCliente = await crearClienteTest("Otro");
    const d = await patch(e.admin.auth, `/ots/${e.otId}`, { clienteId: otroCliente.id });

    expect(a.status).toBe(400);
    expect(b.status).toBe(400);
    expect(c.status).toBe(200);
    expect(d.status).toBe(200);
    expect(d.body.data.cliente.id).toBe(otroCliente.id);
  });
});

describe("GET /ots/:id", () => {
  it("OT inexistente: 404 OT_NO_ENCONTRADA; id mal formado: 400", async () => {
    const e = await crearEscenario();

    const a = await get(e.admin.auth, "/ots/11111111-1111-4111-8111-111111111111");
    const b = await get(e.admin.auth, "/ots/no-es-uuid");

    expect(a.status).toBe(404);
    expect(a.body.code).toBe("OT_NO_ENCONTRADA");
    expect(b.status).toBe(400);
  });

  it("detalle completo con todas las secciones", async () => {
    const e = await crearEscenario();
    await post(e.resp.auth, `/ots/${e.otId}/comentarios`, { cuerpo: "Un comentario" });
    await post(e.resp.auth, `/ots/${e.otId}/horas`, { fecha: "2026-09-01", horas: 1.5 });
    await post(e.resp.auth, `/ots/${e.otId}/horas`, { fecha: "2026-09-02", horas: 2.25 });
    await post(e.resp.auth, `/ots/${e.otId}/etapas`, { nombre: "Diagnóstico", fechaInicio: "2026-09-01", fechaTermino: "2026-09-03" });

    const res = await get(e.lectura.auth, `/ots/${e.otId}`);

    expect(Object.keys(res.body.data).sort()).toEqual(
      [
        "adjuntos", "areaInterna", "categoria", "cadenaResponsables", "cliente", "colaboradores", "comentarios", "cotizaciones",
        "creadoEn", "actualizadoEn", "descripcion", "estado", "esInterna", "etapas", "eventos", "fechaEstimadaTermino", "fechaIngreso",
        "horas", "id", "numero", "origen", "prioridad", "recepcionadoPor", "responsable", "slaEstado", "slaResolucionVenceEn",
        "solicitanteContacto", "solicitanteNombre", "terminadoEn", "tickets", "titulo", "ubicacion",
      ].sort(),
    );
    expect(res.body.data.horas.total).toBe(3.75);
    expect(res.body.data.horas.items).toHaveLength(2);
    expect(res.body.data.etapas).toHaveLength(1);
    expect(res.body.data.comentarios).toHaveLength(1);
    // timeline: más recientes primero
    expect(res.body.data.eventos.map((x: { tipo: string }) => x.tipo)).toEqual([
      "etapa_creada", "horas_registradas", "horas_registradas", "comentario", "creado",
    ]);
  });
});

describe("GET /ots (listado)", () => {
  async function sembrar() {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_t");
    const tec = await crearSesionNombrada(Rol.TECNICO, "tec_t");
    const c1 = await crearClienteTest("Cliente Uno");
    const c2 = await crearClienteTest("Cliente Dos");
    const [media, alta, baja] = await Promise.all([
      obtenerPrioridadPorNombre("Media"),
      obtenerPrioridadPorNombre("Alta"),
      obtenerPrioridadPorNombre("Baja"),
    ]);
    const a = await crearOtApi(admin.auth, c1.id, { titulo: "Bomba alfa", prioridadId: media.id, solicitanteNombre: "Juan Pérez" });
    const b = await crearOtApi(admin.auth, c2.id, { titulo: "Ventilador 100% listo", prioridadId: alta.id, categoria: "reparacion", responsableId: tec.usuario.id });
    const c = await crearOtApi(admin.auth, c1.id, { titulo: "Servidor [rack_1]", prioridadId: baja.id, clienteId: undefined, esInterna: true, areaInterna: "TI" });
    await post(admin.auth, `/ots/${b.id}/estado`, { estado: "en_ejecucion" });
    return { admin, tec, c1, c2, a, b, c, media, alta, baja };
  }
  const numeros = (res: request.Response) => res.body.data.map((o: { numero: string }) => o.numero);

  it("paginación y meta", async () => {
    const s = await sembrar();

    const p1 = await get(s.admin.auth, "/ots?perPage=2&page=1&orden=numero&dir=asc");
    const p2 = await get(s.admin.auth, "/ots?perPage=2&page=2&orden=numero&dir=asc");

    expect(p1.body.meta).toEqual({ page: 1, perPage: 2, total: 3 });
    expect(numeros(p1)).toEqual(["OT-1041", "OT-1042"]);
    expect(numeros(p2)).toEqual(["OT-1043"]);
    expect(p2.body.meta).toEqual({ page: 2, perPage: 2, total: 3 });
  });

  it("orden por columna de la lista blanca; fuera de ella: 400", async () => {
    const s = await sembrar();

    const porPrioridad = await get(s.admin.auth, "/ots?orden=prioridad&dir=asc");
    const malo = await get(s.admin.auth, "/ots?orden=password_hash");
    const inyeccion = await get(s.admin.auth, "/ots?orden=numero;DROP TABLE ot");
    const dirMala = await get(s.admin.auth, "/ots?dir=sideways");

    expect(numeros(porPrioridad)).toEqual(["OT-1042", "OT-1041", "OT-1043"]); // alta, media, baja
    expect(malo.status).toBe(400);
    expect(inyeccion.status).toBe(400);
    expect(dirMala.status).toBe(400);
  });

  it("perPage fuera de rango: 400", async () => {
    const s = await sembrar();
    expect((await get(s.admin.auth, "/ots?perPage=101")).status).toBe(400);
    expect((await get(s.admin.auth, "/ots?page=0")).status).toBe(400);
  });

  it("filtros: estado, prioridad, categoria, cliente, responsable, mios, fechas", async () => {
    const s = await sembrar();
    const ids = async (q: string, auth = s.admin.auth) => numeros(await get(auth, `/ots?orden=numero&dir=asc&${q}`));

    expect(await ids("estado=en_ejecucion")).toEqual(["OT-1042"]);
    expect(await ids(`prioridadId=${s.baja.id}`)).toEqual(["OT-1043"]);
    expect(await ids("categoria=reparacion")).toEqual(["OT-1042"]);
    expect(await ids(`clienteId=${s.c1.id}`)).toEqual(["OT-1041"]);
    expect(await ids(`responsableId=${s.tec.usuario.id}`)).toEqual(["OT-1042"]);
    expect(await ids("mios=true", s.tec.auth)).toEqual(["OT-1042"]);
    expect(await ids("mios=true")).toEqual(["OT-1041", "OT-1043"]);
    expect(await ids("desde=2000-01-01&hasta=2999-01-01")).toEqual(["OT-1041", "OT-1042", "OT-1043"]);
    expect(await ids("desde=2999-01-01")).toEqual([]);
    expect(await ids("hasta=2000-01-01")).toEqual([]);
    expect((await get(s.admin.auth, "/ots?desde=2026-05-02&hasta=2026-05-01")).status).toBe(400);
  });

  it("mios incluye a los colaboradores", async () => {
    const e = await crearEscenario();

    const res = await get(e.colab.auth, "/ots?mios=true");
    const ajeno = await get(e.ajeno.auth, "/ots?mios=true");

    expect(res.body.data).toHaveLength(1);
    expect(ajeno.body.data).toHaveLength(0);
  });

  it("q busca por numero, titulo y solicitante", async () => {
    const s = await sembrar();
    const q = async (t: string) => numeros(await get(s.admin.auth, `/ots?orden=numero&dir=asc&q=${encodeURIComponent(t)}`));

    expect(await q("bomba")).toEqual(["OT-1041"]);
    expect(await q("OT-1042")).toEqual(["OT-1042"]);
    expect(await q("pérez")).toEqual(["OT-1041"]);
  });

  it("q trata % _ y [ como texto literal", async () => {
    const s = await sembrar();
    const q = async (t: string) => numeros(await get(s.admin.auth, `/ots?orden=numero&dir=asc&q=${encodeURIComponent(t)}`));

    expect(await q("%")).toEqual(["OT-1042"]); // solo el título con un % literal, no "todo"
    expect(await q("100%")).toEqual(["OT-1042"]);
    expect(await q("_")).toEqual(["OT-1043"]); // "rack_1"
    expect(await q("[")).toEqual(["OT-1043"]);
    expect(await q("[rack_1]")).toEqual(["OT-1043"]);
    expect(await q("a_fa")).toEqual([]); // "_" no comodín: "alfa" no coincide con "a_fa"
    expect(await q("[a-z]")).toEqual([]); // "[...]" no es rango
    expect(await q("\\")).toEqual([]);
  });

  it("q es un parámetro: una inyección no rompe nada", async () => {
    const s = await sembrar();

    const res = await get(s.admin.auth, `/ots?q=${encodeURIComponent("'; DROP TABLE ot; --")}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(await AppDataSource.query("SELECT COUNT(*) AS n FROM ot").then((r) => r[0].n)).toBe(3);
  });

  it("los elementos del listado tienen la forma esperada", async () => {
    const s = await sembrar();

    const res = await get(s.admin.auth, "/ots?orden=numero&dir=asc&perPage=1");

    expect(res.body.data[0]).toEqual({
      id: s.a.id,
      numero: "OT-1041",
      titulo: "Bomba alfa",
      cliente: { id: s.c1.id, nombre: "Cliente Uno" },
      areaInterna: null,
      esInterna: false,
      categoria: "mantencion",
      prioridad: { id: s.media.id, nombre: "Media" },
      origen: "telefono",
      estado: "ingresado",
      solicitanteNombre: "Juan Pérez",
      responsable: { id: s.admin.usuario.id, nombre: s.admin.usuario.nombre },
      fechaIngreso: expect.any(String),
      fechaEstimadaTermino: null,
      slaEstado: "en_plazo",
    });
  });
});

describe("GET /ots/kanban", () => {
  it("6 columnas en orden, con tarjetas de forma exacta", async () => {
    const e = await crearEscenario();
    await post(e.admin.auth, `/ots/${e.otId}/estado`, { estado: "aprobado" });
    const interna = await crearOtApi(e.admin.auth, e.cliente.id, { clienteId: undefined, esInterna: true, areaInterna: "TI", fechaEstimadaTermino: "2026-11-30" });

    const res = await get(e.lectura.auth, "/ots/kanban");

    expect(res.status).toBe(200);
    expect(res.body.data.map((c: { estado: string }) => c.estado)).toEqual([
      "ingresado", "en_cotizacion", "aprobado", "en_ejecucion", "terminado", "facturado",
    ]);
    const media = await obtenerPrioridadPorNombre("Media");
    const aprobado = res.body.data[2];
    expect(aprobado.total).toBe(1);
    expect(aprobado.ots[0]).toEqual({
      id: e.otId,
      numero: "OT-1041",
      titulo: "Mantención de bomba",
      cliente: { id: e.cliente.id, nombre: e.cliente.nombre },
      areaInterna: null,
      prioridad: { id: media.id, nombre: "Media" },
      responsable: { id: e.resp.usuario.id, nombre: e.resp.usuario.nombre },
      colaboradores: { items: [{ id: e.colab.usuario.id, nombre: e.colab.usuario.nombre }], total: 1 },
      fechaEstimadaTermino: null,
      adjuntosCount: 0,
      slaEstado: "en_plazo",
    });
    const ingresado = res.body.data[0];
    expect(ingresado.ots[0]).toMatchObject({ id: interna.id, cliente: null, areaInterna: "TI", fechaEstimadaTermino: "2026-11-30" });
  });

  it("colaboradores: solo los 3 primeros y el total", async () => {
    const e = await crearEscenario();
    const extras = [];
    for (let i = 0; i < 4; i++) extras.push((await crearSesionNombrada(Rol.TECNICO, `c${i}_t`)).usuario.id);
    for (const id of extras) await post(e.admin.auth, `/ots/${e.otId}/colaboradores`, { usuarioId: id });

    const res = await get(e.admin.auth, "/ots/kanban");

    const card = res.body.data[0].ots[0];
    expect(card.colaboradores.total).toBe(5);
    expect(card.colaboradores.items).toHaveLength(3);
  });

  it("aplica los mismos filtros que el listado", async () => {
    const e = await crearEscenario();
    const prioridadAlta = await obtenerPrioridadPorNombre("Alta");
    await crearOtApi(e.admin.auth, e.cliente.id, { prioridadId: prioridadAlta.id, titulo: "Urgente 100%" });

    const alta = await get(e.admin.auth, `/ots/kanban?prioridadId=${prioridadAlta.id}`);
    const q = await get(e.admin.auth, `/ots/kanban?q=${encodeURIComponent("%")}`);
    const mios = await get(e.ajeno.auth, "/ots/kanban?mios=true");

    expect(alta.body.data[0].total).toBe(1);
    expect(q.body.data[0].ots.map((o: { titulo: string }) => o.titulo)).toEqual(["Urgente 100%"]);
    expect(mios.body.data.every((c: { total: number }) => c.total === 0)).toBe(true);
  });

  it("sin N+1: el número de consultas no crece con la cantidad de OT", async () => {
    const e = await crearEscenario();
    const contar = async () => {
      const original = AppDataSource.logger;
      let n = 0;
      const espia = { logQuery: () => n++, logQueryError() {}, logQuerySlow() {}, logSchemaBuild() {}, logMigration() {}, log() {} };
      (AppDataSource as unknown as { logger: unknown }).logger = espia;
      try {
        const res = await get(e.admin.auth, "/ots/kanban");
        expect(res.status).toBe(200);
      } finally {
        (AppDataSource as unknown as { logger: unknown }).logger = original;
      }
      return n;
    };

    const conPocas = await contar();
    for (let i = 0; i < 8; i++) {
      const o = await crearOtApi(e.admin.auth, e.cliente.id, { colaboradorIds: [e.colab.usuario.id, e.extra.usuario.id] });
      await post(e.admin.auth, `/ots/${o.id}/estado`, { estado: i % 2 ? "terminado" : "aprobado" });
    }
    const conMuchas = await contar();

    expect(conMuchas).toBe(conPocas);
    expect(conMuchas).toBeLessThanOrEqual(5); // authenticate + 3 consultas del kanban
  });
});

describe("DTOs", () => {
  it("ninguna respuesta expone campos internos ni datos de usuario más allá de {id, nombre}", async () => {
    const e = await crearEscenario();
    await post(e.resp.auth, `/ots/${e.otId}/comentarios`, { cuerpo: "hola" });
    await post(e.resp.auth, `/ots/${e.otId}/derivar`, { destinoId: e.extra.usuario.id, motivo: "Se requiere otra especialidad" });

    const respuestas = [
      await get(e.admin.auth, `/ots/${e.otId}`),
      await get(e.admin.auth, "/ots"),
      await get(e.admin.auth, "/ots/kanban"),
      await get(e.admin.auth, `/ots/${e.otId}/comentarios`),
      await get(e.admin.auth, `/ots/${e.otId}/horas`),
    ].map((r) => JSON.stringify(r.body));

    for (const json of respuestas) {
      for (const prohibido of ["passwordHash", "password_hash", "mustChangePassword", "email", "@test.local", "username", "storageKey", "storage_key", "sha256", "rol\""]) {
        expect(json).not.toContain(prohibido);
      }
    }
    const detalle = JSON.parse(respuestas[0]!);
    const usuarios = [
      detalle.data.recepcionadoPor,
      detalle.data.responsable,
      ...detalle.data.colaboradores,
      ...detalle.data.cadenaResponsables.map((t: { usuario: unknown }) => t.usuario),
      ...detalle.data.comentarios.map((c: { autor: unknown }) => c.autor),
      ...detalle.data.eventos.map((ev: { actor: unknown }) => ev.actor),
    ];
    for (const u of usuarios) expect(Object.keys(u).sort()).toEqual(["id", "nombre"]);
  });
});

