import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppDataSource } from "../config/dataSource.js";
import { Rol } from "../entities/enums.js";
import { AppError } from "../errors/AppError.js";
import { conflictoConcurrencia, numeroErrorSql } from "../errors/dbErrors.js";
import { conectarBD, limpiarBD } from "../test/helpers.js";
import { crearSesionNombrada } from "../test/otHelpers.js";
import { eventoCotizacionSchema, eventoOtSchema, registrarEventoCotizacion, registrarEventoOt } from "./evento.service.js";
import { enTransaccion } from "./folio.service.js";
import { escaparLike } from "./ot.service.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

const id = () => randomUUID();

describe("payload de eventos", () => {
  it("cada tipo de la fase 1 valida su forma", () => {
    const validos = [
      { tipo: "creado", numero: "OT-1041", responsableId: id(), clienteId: null, esInterna: true },
      { tipo: "estado_cambiado", de: "ingresado", a: "aprobado" },
      { tipo: "prioridad_cambiada", de: id(), a: id() },
      { tipo: "derivado", de: id(), a: id(), motivo: "motivo largo", mantuvoComoColaborador: false },
      { tipo: "comentario", comentarioId: id(), visibleCliente: false },
      { tipo: "horas_registradas", horaId: id(), usuarioId: id(), fecha: "2026-09-01", horas: 1.5 },
      { tipo: "colaborador_agregado", usuarioId: id() },
      { tipo: "colaborador_quitado", usuarioId: id() },
      { tipo: "etapa_creada", etapaId: id() },
      { tipo: "etapa_editada", etapaId: id(), campos: ["nombre"] },
      { tipo: "etapa_eliminada", etapaId: id() },
      { tipo: "adjunto_agregado", adjuntoId: id(), mime: "application/pdf", tamanoBytes: 10 },
      { tipo: "ot_editada", campos: ["titulo"] },
    ];
    for (const v of validos) expect(eventoOtSchema.safeParse(v).success, v.tipo).toBe(true);
  });

  it.each([
    ["tipo desconocido", { tipo: "inventado" }],
    ["falta un campo", { tipo: "estado_cambiado", de: "ingresado" }],
    ["campo de más (no se cuelan copias de datos)", { tipo: "colaborador_agregado", usuarioId: randomUUID(), email: "a@b.cl" }],
    ["id que no es uuid", { tipo: "colaborador_quitado", usuarioId: "juan" }],
    ["ot_editada sin campos", { tipo: "ot_editada", campos: [] }],
  ])("rechaza: %s", (_n, v) => {
    expect(eventoOtSchema.safeParse(v).success).toBe(false);
  });

  it("fase 2: los tipos cotizacion_creada/vinculada/estado_cambiado del lado OT validan su forma", () => {
    const validos = [
      { tipo: "cotizacion_creada", cotizacionId: id(), numero: "COT-2041" },
      { tipo: "cotizacion_vinculada", cotizacionId: id(), numero: "COT-2041" },
      { tipo: "cotizacion_estado_cambiado", cotizacionId: id(), de: "borrador", a: "enviada" },
    ];
    for (const v of validos) expect(eventoOtSchema.safeParse(v).success, v.tipo).toBe(true);
  });

  it("eventoCotizacionSchema: cotizacion_editada y cotizacion_estado_cambiado", () => {
    const validos = [
      { tipo: "cotizacion_editada", campos: ["montoClp"], montoClpAntes: 100, montoClpDespues: 200 },
      { tipo: "cotizacion_estado_cambiado", de: "borrador", a: "enviada" },
    ];
    for (const v of validos) expect(eventoCotizacionSchema.safeParse(v).success, v.tipo).toBe(true);
  });

  it.each([
    ["tipo desconocido", { tipo: "inventado" }],
    ["editada sin campos", { tipo: "cotizacion_editada", campos: [], montoClpAntes: 1, montoClpDespues: 1 }],
    ["editada con campo de más", { tipo: "cotizacion_editada", campos: ["montoClp"], montoClpAntes: 1, montoClpDespues: 1, extra: true }],
    ["la forma del lado OT (con cotizacionId) no cuela en el lado cotización", { tipo: "cotizacion_estado_cambiado", cotizacionId: randomUUID(), de: "borrador", a: "enviada" }],
  ])("eventoCotizacionSchema rechaza: %s", (_n, v) => {
    expect(eventoCotizacionSchema.safeParse(v).success).toBe(false);
  });

  it("registrarEventoCotizacion valida antes de insertar y usa entidad_tipo='cotizacion'", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_t");
    const cotizacionId = id();

    await enTransaccion(AppDataSource, (m) =>
      registrarEventoCotizacion(m, cotizacionId, admin.usuario.id, { tipo: "cotizacion_estado_cambiado", de: "borrador", a: "enviada" }),
    );

    const filas = await AppDataSource.query(`SELECT entidad_tipo, entidad_id, tipo FROM evento WHERE entidad_id = @0`, [cotizacionId]);
    expect(filas).toHaveLength(1);
    expect(filas[0].entidad_tipo).toBe("cotizacion");
    expect(filas[0].tipo).toBe("cotizacion_estado_cambiado");

    await expect(
      enTransaccion(AppDataSource, (m) => registrarEventoCotizacion(m, id(), admin.usuario.id, { tipo: "cotizacion_editada" } as never)),
    ).rejects.toThrow();
  });

  it("registrarEventoOt valida antes de insertar (nada se escribe con un payload inválido)", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_t");

    await expect(
      enTransaccion(AppDataSource, (m) => registrarEventoOt(m, id(), admin.usuario.id, { tipo: "estado_cambiado", de: "x" } as never)),
    ).rejects.toThrow();

    expect(await AppDataSource.query("SELECT COUNT(*) AS n FROM evento").then((r) => r[0].n)).toBe(0);
  });

  it("la tabla evento sigue siendo inmutable (UPDATE y DELETE fallan con 50002)", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_t");
    await enTransaccion(AppDataSource, (m) => registrarEventoOt(m, id(), admin.usuario.id, { tipo: "ot_editada", campos: ["titulo"] }));

    const upd = await AppDataSource.query("UPDATE evento SET tipo = 'x'").catch((e) => e);
    const del = await AppDataSource.query("DELETE FROM evento").catch((e) => e);

    expect(numeroErrorSql(upd)).toBe(50002);
    expect(numeroErrorSql(del)).toBe(50002);
  });
});

describe("conflictoConcurrencia (errores reales de SQL Server)", () => {
  async function conUnTramoAbierto() {
    const u1 = await crearSesionNombrada(Rol.TECNICO, "u1_t");
    const u2 = await crearSesionNombrada(Rol.TECNICO, "u2_t");
    const entidad = id();
    await AppDataSource.query(`INSERT INTO asignacion (id, entidad_tipo, entidad_id, usuario_id) VALUES (@0, 'ot', @1, @2)`, [id(), entidad, u1.usuario.id]);
    return { u1, u2, entidad };
  }

  it("un segundo tramo abierto viola el índice único (2601) y se mapea a 409", async () => {
    const { u2, entidad } = await conUnTramoAbierto();

    const err = await AppDataSource.query(`INSERT INTO asignacion (id, entidad_tipo, entidad_id, usuario_id) VALUES (@0, 'ot', @1, @2)`, [id(), entidad, u2.usuario.id]).catch((e) => e);

    expect([2601, 2627]).toContain(numeroErrorSql(err));
    const mapeado = conflictoConcurrencia(err);
    expect(mapeado).toBeInstanceOf(AppError);
    expect(mapeado).toMatchObject({ status: 409, code: "CONFLICTO_CONCURRENCIA" });
  });

  it("un tramo cerrado que se solapa lo rechaza el trigger (50001) y se mapea a 409", async () => {
    const { u2, entidad } = await conUnTramoAbierto();

    const err = await AppDataSource.query(
      `INSERT INTO asignacion (id, entidad_tipo, entidad_id, usuario_id, desde, hasta)
       VALUES (@0, 'ot', @1, @2, DATEADD(day, 1, SYSDATETIMEOFFSET()), DATEADD(day, 2, SYSDATETIMEOFFSET()))`,
      [id(), entidad, u2.usuario.id],
    ).catch((e) => e);

    expect(numeroErrorSql(err)).toBe(50001);
    expect(conflictoConcurrencia(err)).toMatchObject({ status: 409, code: "CONFLICTO_CONCURRENCIA" });
  });

  it("no toca errores que no son de concurrencia", () => {
    expect(conflictoConcurrencia(new Error("otra cosa"))).toBeNull();
  });
});

describe("escaparLike", () => {
  it.each([
    ["100%", "100\\%"],
    ["a_b", "a\\_b"],
    ["[x]", "\\[x]"],
    ["a\\b", "a\\\\b"],
    ["normal", "normal"],
  ])("%s -> %s", (entrada, esperado) => {
    expect(escaparLike(entrada)).toBe(esperado);
  });
});
