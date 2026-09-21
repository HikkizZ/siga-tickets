import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppDataSource } from "../config/dataSource.js";
import { Cliente } from "../entities/Cliente.js";
import { CalendarioLaboral } from "../entities/CalendarioLaboral.js";
import { Evento } from "../entities/Evento.js";
import { Feriado } from "../entities/Feriado.js";
import { MensajeTicket } from "../entities/MensajeTicket.js";
import { entidades } from "../entities/index.js";
import { ERR_ASIGNACION_SOLAPE, ERR_DEADLOCK, numeroErrorSql } from "../errors/dbErrors.js";
import { conectarBD, limpiarBD } from "../test/helpers.js";

// Restricciones que TypeORM no modela: se prueban directo contra SQL, sin pasar por entidades.

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

// Un INSERT/UPDATE sin OUTPUT devuelve undefined en el driver de SQL Server: se normaliza a [].
const sql = async (texto: string, params: unknown[] = []): Promise<any[]> => (await AppDataSource.query(texto, params)) ?? [];

let contador = 0;
const sig = () => ++contador;

async function usuario(email?: string): Promise<string> {
  const n = sig();
  const [fila] = await sql(
    `INSERT INTO usuario (username, nombre, email, password_hash, rol)
     OUTPUT INSERTED.id
     VALUES (@0, 'U', @1, 'x', 'tecnico')`,
    [`u${n}`, email ?? `u${n}@t.local`],
  );
  return fila.id;
}

async function cliente(): Promise<string> {
  const [fila] = await sql(`INSERT INTO cliente (nombre) OUTPUT INSERTED.id VALUES (@0)`, [`Cliente ${sig()}`]);
  return fila.id;
}

async function ticket(email = "ana@test.cl"): Promise<string> {
  const recep = await usuario();
  const [fila] = await sql(
    `INSERT INTO ticket (numero, asunto, descripcion, solicitante_nombre, solicitante_email, canal, prioridad, recepcionado_por_id)
     OUTPUT INSERTED.id
     VALUES (@0, 'a', 'd', 'Ana', @1, 'telefono', 'media', @2)`,
    [`TK-${sig()}`, email, recep],
  );
  return fila.id;
}

async function ot(): Promise<string> {
  const [cli, recep] = [await cliente(), await usuario()];
  const [fila] = await sql(
    `INSERT INTO ot (numero, titulo, descripcion, cliente_id, categoria, prioridad, origen, recepcionado_por_id)
     OUTPUT INSERTED.id
     VALUES (@0, 't', 'd', @1, 'soporte', 'media', 'telefono', @2)`,
    [`OT-${sig()}`, cli, recep],
  );
  return fila.id;
}

describe("objetos del esquema", () => {
  it("existen los índices filtrados, la columna calculada, los triggers y los CHECK JSON", async () => {
    const filtrados: Array<{ name: string; filter_definition: string; is_unique: boolean }> = await sql(
      `SELECT name, filter_definition, is_unique FROM sys.indexes WHERE has_filter = 1`,
    );
    const porNombre = Object.fromEntries(filtrados.map((i) => [i.name, i]));
    expect(Object.keys(porNombre).sort()).toEqual(
      [
        "idx_correo_saliente_pendiente",
        "idx_notificacion_no_leidas",
        "idx_ot_responsable_abierta",
        "idx_ticket_responsable_abierto",
        "idx_ticket_sla_abierto",
        "uq_asignacion_tramo_abierto",
        "uq_cotizacion_principal_por_ot",
        "uq_mensaje_ticket_message_id",
        "uq_sla_pausa_abierta",
        "uq_ticket_ot_origen",
      ].sort(),
    );
    for (const unico of [
      "uq_asignacion_tramo_abierto",
      "uq_cotizacion_principal_por_ot",
      "uq_mensaje_ticket_message_id",
      "uq_sla_pausa_abierta",
      "uq_ticket_ot_origen",
    ]) {
      expect(porNombre[unico]!.is_unique).toBeTruthy();
    }
    expect(porNombre["uq_mensaje_ticket_message_id"]!.filter_definition).toMatch(/message_id\]? IS NOT NULL/);

    // Sin equivalentes de trigram / extensiones de PG
    const trgm = await sql(`SELECT name FROM sys.indexes WHERE name LIKE '%trgm%'`);
    expect(trgm).toEqual([]);

    const [calc] = await sql(
      `SELECT definition, is_persisted FROM sys.computed_columns
       WHERE object_id = OBJECT_ID('asignacion') AND name = 'duracion_seg'`,
    );
    expect(calc.definition).toMatch(/datediff/i);

    const triggers = (await sql(`SELECT name FROM sys.triggers WHERE parent_class = 1 ORDER BY name`)).map((t) => t.name);
    expect(triggers).toEqual(["trg_asignacion_sin_solape", "trg_evento_inmutable"]);

    const json = (await sql(`SELECT name FROM sys.check_constraints WHERE definition LIKE '%isjson%' ORDER BY name`)).map(
      (c) => c.name,
    );
    expect(json).toEqual([
      "correo_saliente_headers_json_check",
      "evento_payload_json_check",
      "mensaje_ticket_referencias_json_check",
    ]);
  });

  it("semillas: folio_counter, sla_config y calendario_laboral", async () => {
    const folios = await sql(`SELECT serie, CAST(ultimo AS int) AS ultimo, ancho FROM folio_counter ORDER BY serie`);
    expect(folios).toEqual([
      { serie: "COT", ultimo: 2040, ancho: 4 },
      { serie: "OT", ultimo: 1040, ancho: 4 },
      { serie: "TK", ultimo: 0, ancho: 4 },
    ]);

    const sla = await sql(
      `SELECT prioridad, horas_resolucion, horas_primera_respuesta, usar_horas_habiles, pausar_en_espera_cliente,
              CAST(umbral_por_vencer AS float) AS umbral
       FROM sla_config ORDER BY horas_resolucion`,
    );
    expect(sla).toEqual([
      { prioridad: "alta", horas_resolucion: 24, horas_primera_respuesta: 2, usar_horas_habiles: true, pausar_en_espera_cliente: true, umbral: 0.2 },
      { prioridad: "media", horas_resolucion: 72, horas_primera_respuesta: 8, usar_horas_habiles: true, pausar_en_espera_cliente: true, umbral: 0.2 },
      { prioridad: "baja", horas_resolucion: 120, horas_primera_respuesta: 24, usar_horas_habiles: true, pausar_en_espera_cliente: true, umbral: 0.2 },
    ]);

    const cal = await sql(
      `SELECT dia_semana, CONVERT(varchar(8), hora_inicio, 108) AS ini, CONVERT(varchar(8), hora_fin, 108) AS fin
       FROM calendario_laboral ORDER BY dia_semana`,
    );
    expect(cal).toEqual([1, 2, 3, 4, 5].map((d) => ({ dia_semana: d, ini: "09:00:00", fin: "18:30:00" })));
  });
});

describe("entidades TypeORM vs esquema", () => {
  // Si una columna de la entidad no existe en la migración (o al revés de nombre), el SELECT falla.
  it.each(entidades.map((e) => [e.name, e] as const))("%s se puede consultar", async (_nombre, entidad) => {
    await expect(AppDataSource.getRepository(entidad).find({ take: 1 })).resolves.toBeInstanceOf(Array);
  });

  it("date llega como string YYYY-MM-DD y time como HH:MM:SS", async () => {
    await AppDataSource.getRepository(Feriado).save({ fecha: "2026-09-18", nombre: "Fiestas Patrias", irrenunciable: true });

    const feriado = await AppDataSource.getRepository(Feriado).findOneByOrFail({ fecha: "2026-09-18" });
    expect(feriado.fecha).toBe("2026-09-18");

    const cal = await AppDataSource.getRepository(CalendarioLaboral).find({ order: { diaSemana: "ASC" } });
    expect(cal[0]).toMatchObject({ diaSemana: 1, horaInicio: "09:00:00", horaFin: "18:30:00" });
  });

  it("los uuid salen en minúsculas aunque SQL Server los entregue en mayúsculas", async () => {
    const id = await cliente();

    const [crudo] = await sql(`SELECT id FROM cliente`);
    expect(crudo.id).toBe(crudo.id.toUpperCase()); // el driver los devuelve en mayúsculas
    const c = await AppDataSource.getRepository(Cliente).findOneByOrFail({ id });
    expect(c.id).toBe(id.toLowerCase());
  });

  it("timestamps: creado_en y actualizado_en quedan en UTC correcto (sin desfase de zona)", async () => {
    const repo = AppDataSource.getRepository(Cliente);
    const c = await repo.save(repo.create({ nombre: "Cliente TZ" }));
    const ahora = Date.now();
    expect(Math.abs(c.creadoEn.getTime() - ahora)).toBeLessThan(60_000);

    await new Promise((r) => setTimeout(r, 30));
    c.activo = false;
    await repo.save(c);
    const recargado = await repo.findOneByOrFail({ id: c.id });
    expect(recargado.actualizadoEn.getTime()).toBeGreaterThan(recargado.creadoEn.getTime());
    expect(Math.abs(recargado.actualizadoEn.getTime() - Date.now())).toBeLessThan(60_000);
  });

  it("evento.payload y mensaje_ticket.referencias hacen ida y vuelta como JSON", async () => {
    const t = await ticket();
    const ev = AppDataSource.getRepository(Evento);
    const guardado = await ev.save(ev.create({ entidadTipo: "ticket" as never, entidadId: t, tipo: "creado", payload: { a: 1, b: ["x"] } }));
    expect((await ev.findOneByOrFail({ id: guardado.id })).payload).toEqual({ a: 1, b: ["x"] });

    const msgs = AppDataSource.getRepository(MensajeTicket);
    const m = await msgs.save(
      msgs.create({ ticketId: t, tipo: "cliente" as never, autorExterno: "ana", cuerpo: "hola", referencias: ["<a@x>", "<b@x>"] }),
    );
    expect((await msgs.findOneByOrFail({ id: m.id })).referencias).toEqual(["<a@x>", "<b@x>"]);
  });
});

describe("colación de la base de datos", () => {
  // Este test FALLA si la BD no es case-insensitive: el diseño depende de ello (ticket.solicitante_email
  // sin citext, UNIQUE de usuario.email/username y de cliente.nombre).
  it("es CI (no distingue mayúsculas) y AS (distingue acentos)", async () => {
    const [{ colacion }] = await sql(`SELECT CAST(DATABASEPROPERTYEX(DB_NAME(), 'Collation') AS varchar(100)) AS colacion`);
    expect(colacion).toMatch(/_CI_AS$/);

    const [r] = await sql(
      `SELECT CASE WHEN CAST('Ana' AS nvarchar(10)) = CAST('ANA' AS nvarchar(10)) THEN 1 ELSE 0 END AS ci,
              CASE WHEN CAST(N'á' AS nvarchar(10)) = CAST(N'a' AS nvarchar(10)) THEN 1 ELSE 0 END AS sin_acentos`,
    );
    expect(r.ci).toBe(1);
    expect(r.sin_acentos).toBe(0);
  });

  it("los literales de una columna se comparan con la colación de la tabla (CI)", async () => {
    await usuario("Mixto@Test.CL");

    await expect(usuario("mixto@test.cl")).rejects.toThrow(/uq_usuario_email/);
  });
});

describe("asignacion", () => {
  const insertar = (entidad: string, usu: string, desde: string, hasta: string | null) =>
    sql(
      `INSERT INTO asignacion (entidad_tipo, entidad_id, usuario_id, desde, hasta)
       VALUES ('ticket', @0, @1, @2, @3)`,
      [entidad, usu, desde, hasta],
    );

  it("rechaza un segundo tramo abierto para la misma entidad (índice único filtrado)", async () => {
    const [entidad, u1, u2] = [randomUUID(), await usuario(), await usuario()];
    await insertar(entidad, u1, "2026-09-01T10:00:00Z", null);

    await expect(insertar(entidad, u2, "2026-09-02T10:00:00Z", null)).rejects.toThrow(/uq_asignacion_tramo_abierto/);
  });

  it("rechaza tramos solapados (trigger)", async () => {
    const [entidad, u1, u2] = [randomUUID(), await usuario(), await usuario()];
    await insertar(entidad, u1, "2026-09-01T10:00:00Z", "2026-09-01T12:00:00Z");

    await expect(insertar(entidad, u2, "2026-09-01T11:00:00Z", "2026-09-01T13:00:00Z")).rejects.toThrow(
      /asignacion_sin_solape/,
    );
    // un tramo abierto que arranca dentro de uno cerrado también se solapa
    await expect(insertar(entidad, u2, "2026-09-01T11:30:00Z", null)).rejects.toThrow(/asignacion_sin_solape/);
    // y uno cerrado que contiene por completo a otro
    await expect(insertar(entidad, u2, "2026-09-01T09:00:00Z", "2026-09-01T13:00:00Z")).rejects.toThrow(
      /asignacion_sin_solape/,
    );
    const [{ n }] = await sql(`SELECT COUNT(*) AS n FROM asignacion`);
    expect(n).toBe(1); // los rechazados no dejaron fila
  });

  it("el trigger también rechaza un UPDATE que crearía un solape", async () => {
    const [entidad, u1, u2] = [randomUUID(), await usuario(), await usuario()];
    await insertar(entidad, u1, "2026-09-01T10:00:00Z", "2026-09-01T12:00:00Z");
    await insertar(entidad, u2, "2026-09-01T12:00:00Z", "2026-09-01T14:00:00Z");

    await expect(
      sql(`UPDATE asignacion SET hasta = '2026-09-01T13:00:00Z' WHERE usuario_id = @0`, [u1]),
    ).rejects.toThrow(/asignacion_sin_solape/);
  });

  it("acepta tramos contiguos, otra entidad con las mismas horas y un nuevo abierto tras cerrar el anterior", async () => {
    const [entidad, otra, u1, u2] = [randomUUID(), randomUUID(), await usuario(), await usuario()];
    await insertar(entidad, u1, "2026-09-01T10:00:00Z", "2026-09-01T12:00:00Z");
    await insertar(entidad, u2, "2026-09-01T12:00:00Z", null); // contiguo: [) no solapa
    await insertar(otra, u1, "2026-09-01T10:00:00Z", null);

    const [{ n }] = await sql(`SELECT COUNT(*) AS n FROM asignacion`);
    expect(n).toBe(3);
  });

  it("hasta <= desde falla", async () => {
    const [entidad, u1] = [randomUUID(), await usuario()];

    await expect(insertar(entidad, u1, "2026-09-01T10:00:00Z", "2026-09-01T10:00:00Z")).rejects.toThrow(
      /asignacion_hasta_check/,
    );
    await expect(insertar(entidad, u1, "2026-09-01T10:00:00Z", "2026-09-01T09:00:00Z")).rejects.toThrow(
      /asignacion_hasta_check/,
    );
  });

  it("SÍ se puede actualizar (cerrar el tramo) y duracion_seg se calcula sola", async () => {
    const [entidad, u1] = [randomUUID(), await usuario()];
    await insertar(entidad, u1, "2026-09-01T10:00:00Z", null);

    const [abierto] = await sql(`SELECT duracion_seg FROM asignacion WHERE entidad_id = @0`, [entidad]);
    expect(abierto.duracion_seg).toBeNull();

    await sql(`UPDATE asignacion SET hasta = '2026-09-01T12:30:00Z' WHERE entidad_id = @0`, [entidad]);
    const [cerrado] = await sql(`SELECT duracion_seg FROM asignacion WHERE entidad_id = @0`, [entidad]);
    expect(cerrado.duracion_seg).toBe(9000);
  });

  it("no se puede escribir la columna calculada", async () => {
    await expect(
      sql(`INSERT INTO asignacion (entidad_tipo, entidad_id, usuario_id, duracion_seg) VALUES ('ot', @0, @1, 5)`, [
        randomUUID(),
        await usuario(),
      ]),
    ).rejects.toThrow(/duracion_seg/);
  });

  // Dos transacciones que intentan asignar tramos solapados a la misma entidad a la vez: gracias a
  // UPDLOCK+HOLDLOCK del trigger, solo una sobrevive (la otra recibe 50001 o es víctima de deadlock).
  it("solape concurrente: de dos transacciones simultáneas solo una se confirma", async () => {
    const [u1, u2] = [await usuario(), await usuario()];

    for (let ronda = 0; ronda < 8; ronda++) {
      const entidad = randomUUID();
      const intentar = (usu: string, desde: string, hasta: string) =>
        AppDataSource.transaction(async (m) => {
          await m.query(
            `INSERT INTO asignacion (entidad_tipo, entidad_id, usuario_id, desde, hasta) VALUES ('ticket', @0, @1, @2, @3)`,
            [entidad, usu, desde, hasta],
          );
          // Mantiene la transacción abierta para forzar el entrelazado antes del COMMIT.
          await new Promise((r) => setTimeout(r, 150));
        });

      const res = await Promise.allSettled([
        intentar(u1, "2026-09-01T10:00:00Z", "2026-09-01T12:00:00Z"),
        intentar(u2, "2026-09-01T11:00:00Z", "2026-09-01T13:00:00Z"),
      ]);

      const rechazados = res.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(rechazados).toHaveLength(1);
      expect([ERR_ASIGNACION_SOLAPE, ERR_DEADLOCK]).toContain(numeroErrorSql(rechazados[0]!.reason));
      const [{ n }] = await sql(`SELECT COUNT(*) AS n FROM asignacion WHERE entidad_id = @0`, [entidad]);
      expect(n).toBe(1);
    }
  });
});

describe("ot: CHECK de es_interna", () => {
  const insertar = (esInterna: boolean, area: string | null, cli: string | null) =>
    sql(
      `INSERT INTO ot (numero, titulo, descripcion, cliente_id, area_interna, es_interna, categoria, prioridad, origen, recepcionado_por_id)
       SELECT TOP 1 @0, 't', 'd', @1, @2, @3, 'soporte', 'media', 'interna', id FROM usuario`,
      [`OT-${sig()}`, cli, area, esInterna],
    );

  it("acepta interna con área y sin cliente, y no interna con cliente", async () => {
    await usuario();
    const cli = await cliente();

    await expect(insertar(true, "Contabilidad", null)).resolves.toBeDefined();
    await expect(insertar(false, null, cli)).resolves.toBeDefined();
  });

  it("interna sin área, o interna con cliente, falla", async () => {
    await usuario();
    const cli = await cliente();

    await expect(insertar(true, null, null)).rejects.toThrow(/ot_interna_check/);
    await expect(insertar(true, "Contabilidad", cli)).rejects.toThrow(/ot_interna_check/);
  });

  it("no interna sin cliente falla", async () => {
    await usuario();

    await expect(insertar(false, null, null)).rejects.toThrow(/ot_interna_check/);
    await expect(insertar(false, "Contabilidad", null)).rejects.toThrow(/ot_interna_check/);
  });
});

describe("evento: append-only", () => {
  const insertar = () =>
    sql(
      `INSERT INTO evento (entidad_tipo, entidad_id, tipo, payload)
       OUTPUT INSERTED.id
       VALUES ('ticket', @0, 'creado', '{"a":1}')`,
      [randomUUID()],
    );

  it("acepta INSERT", async () => {
    const [fila] = await insertar();

    expect(fila.id).toBeDefined();
  });

  it("rechaza UPDATE", async () => {
    const [fila] = await insertar();

    await expect(sql(`UPDATE evento SET tipo = 'otro' WHERE id = @0`, [fila.id])).rejects.toThrow(/append-only/);
    const [{ tipo }] = await sql(`SELECT tipo FROM evento WHERE id = @0`, [fila.id]);
    expect(tipo).toBe("creado");
  });

  it("rechaza DELETE", async () => {
    const [fila] = await insertar();

    await expect(sql(`DELETE FROM evento WHERE id = @0`, [fila.id])).rejects.toThrow(/append-only/);
    const [{ n }] = await sql(`SELECT COUNT(*) AS n FROM evento`);
    expect(n).toBe(1);
  });

  it("rechaza tipo de entidad fuera del catálogo", async () => {
    await expect(
      sql(`INSERT INTO evento (entidad_tipo, entidad_id, tipo) VALUES ('usuario', @0, 'creado')`, [randomUUID()]),
    ).rejects.toThrow(/evento_entidad_tipo_check/);
  });

  it("ISJSON rechaza un payload que no es JSON válido", async () => {
    const insertarPayload = (payload: string) =>
      sql(`INSERT INTO evento (entidad_tipo, entidad_id, tipo, payload) VALUES ('ticket', @0, 'creado', @1)`, [
        randomUUID(),
        payload,
      ]);

    await expect(insertarPayload("{no es json")).rejects.toThrow(/evento_payload_json_check/);
    await expect(insertarPayload("")).rejects.toThrow(/evento_payload_json_check/);
    await expect(insertarPayload('{"ok":true}')).resolves.toBeDefined();
    await expect(insertarPayload("[1,2]")).resolves.toBeDefined();
  });
});

describe("mensaje_ticket: CHECK autor/tipo", () => {
  const insertar = (tipo: string, autorId: string | null, autorExterno: string | null, ticketId: string) =>
    sql(
      `INSERT INTO mensaje_ticket (ticket_id, tipo, autor_id, autor_externo, cuerpo) VALUES (@0, @1, @2, @3, 'hola')`,
      [ticketId, tipo, autorId, autorExterno],
    );

  it("acepta las combinaciones válidas", async () => {
    const [t, u] = [await ticket(), await usuario()];

    await expect(insertar("cliente", null, "ana@test.cl", t)).resolves.toBeDefined();
    await expect(insertar("respuesta_cliente", u, null, t)).resolves.toBeDefined();
    await expect(insertar("nota_interna", u, null, t)).resolves.toBeDefined();
  });

  it("rechaza las combinaciones inválidas", async () => {
    const [t, u] = [await ticket(), await usuario()];
    const mal = /mensaje_ticket_autor_check/;

    await expect(insertar("cliente", null, null, t)).rejects.toThrow(mal); // cliente sin autor externo
    await expect(insertar("cliente", u, "ana@test.cl", t)).rejects.toThrow(mal); // cliente con autor interno
    await expect(insertar("cliente", u, null, t)).rejects.toThrow(mal);
    await expect(insertar("nota_interna", null, "ana@test.cl", t)).rejects.toThrow(mal); // interno sin autor_id
    await expect(insertar("respuesta_cliente", null, null, t)).rejects.toThrow(mal);
  });

  it("rechaza un tipo fuera del catálogo", async () => {
    const [t, u] = [await ticket(), await usuario()];

    await expect(insertar("publico", u, null, t)).rejects.toThrow(/mensaje_ticket_tipo_check/);
  });

  describe("message_id: único solo cuando no es NULL", () => {
    const conMessageId = (ticketId: string, messageId: string | null) =>
      sql(
        `INSERT INTO mensaje_ticket (ticket_id, tipo, autor_externo, cuerpo, message_id) VALUES (@0, 'cliente', 'ana', 'hola', @1)`,
        [ticketId, messageId],
      );

    it("dos message_id NULL están permitidos", async () => {
      const t = await ticket();

      await conMessageId(t, null);
      await expect(conMessageId(t, null)).resolves.toBeDefined();
      const [{ n }] = await sql(`SELECT COUNT(*) AS n FROM mensaje_ticket WHERE message_id IS NULL`);
      expect(n).toBe(2);
    });

    it("un message_id no nulo duplicado se rechaza (aunque sea de otro ticket)", async () => {
      const [t1, t2] = [await ticket(), await ticket()];
      await conMessageId(t1, "<abc@mail.local>");

      await expect(conMessageId(t2, "<abc@mail.local>")).rejects.toThrow(/uq_mensaje_ticket_message_id/);
      await expect(conMessageId(t2, "<otro@mail.local>")).resolves.toBeDefined();
    });
  });

  it("referencias: acepta NULL y un arreglo JSON; rechaza texto que no es JSON", async () => {
    const t = await ticket();
    const conRef = (ref: string | null) =>
      sql(
        `INSERT INTO mensaje_ticket (ticket_id, tipo, autor_externo, cuerpo, referencias) VALUES (@0, 'cliente', 'ana', 'hola', @1)`,
        [t, ref],
      );

    await expect(conRef(null)).resolves.toBeDefined();
    await expect(conRef('["<a@x>","<b@x>"]')).resolves.toBeDefined();
    await expect(conRef("<a@x> <b@x>")).rejects.toThrow(/mensaje_ticket_referencias_json_check/);
  });
});

describe("cotizacion: una principal por OT", () => {
  const insertar = (otId: string | null, principal: boolean) =>
    sql(`INSERT INTO cotizacion (numero, ot_id, monto_clp, es_principal) VALUES (@0, @1, 1000, @2)`, [
      `COT-${sig()}`,
      otId,
      principal,
    ]);

  it("una segunda cotización principal para la misma OT falla", async () => {
    const o = await ot();
    await insertar(o, true);

    await expect(insertar(o, true)).rejects.toThrow(/uq_cotizacion_principal_por_ot/);
  });

  it("acepta N no principales, principales en OT distintas y varias principales sin OT", async () => {
    const [o1, o2] = [await ot(), await ot()];

    await insertar(o1, true);
    await insertar(o1, false);
    await insertar(o1, false);
    await insertar(o2, true);
    await insertar(null, true);
    await insertar(null, true);
    const [{ n }] = await sql(`SELECT COUNT(*) AS n FROM cotizacion`);
    expect(n).toBe(6);
  });

  it("monto negativo falla", async () => {
    await expect(sql(`INSERT INTO cotizacion (numero, monto_clp) VALUES (@0, -1)`, [`COT-${sig()}`])).rejects.toThrow(
      /cotizacion_monto_check/,
    );
  });
});

describe("ticket_ot: un solo ticket de origen por OT", () => {
  it("un segundo es_origen para la misma OT falla", async () => {
    const [o, t1, t2, u] = [await ot(), await ticket(), await ticket(), await usuario()];
    await sql(`INSERT INTO ticket_ot (ticket_id, ot_id, es_origen, vinculado_por_id) VALUES (@0, @1, 1, @2)`, [t1, o, u]);

    await expect(
      sql(`INSERT INTO ticket_ot (ticket_id, ot_id, es_origen, vinculado_por_id) VALUES (@0, @1, 1, @2)`, [t2, o, u]),
    ).rejects.toThrow(/uq_ticket_ot_origen/);
    // vincular otro ticket sin marcarlo origen sí se puede
    await expect(
      sql(`INSERT INTO ticket_ot (ticket_id, ot_id, es_origen, vinculado_por_id) VALUES (@0, @1, 0, @2)`, [t2, o, u]),
    ).resolves.toBeDefined();
  });
});

describe("sla_pausa: una pausa abierta por entidad", () => {
  it("rechaza una segunda pausa abierta y acepta otra tras cerrar la primera", async () => {
    const entidad = randomUUID();
    await sql(`INSERT INTO sla_pausa (entidad_tipo, entidad_id) VALUES ('ticket', @0)`, [entidad]);

    await expect(sql(`INSERT INTO sla_pausa (entidad_tipo, entidad_id) VALUES ('ticket', @0)`, [entidad])).rejects.toThrow(
      /uq_sla_pausa_abierta/,
    );
    await sql(`UPDATE sla_pausa SET hasta = SYSDATETIMEOFFSET() WHERE entidad_id = @0`, [entidad]);
    await expect(
      sql(`INSERT INTO sla_pausa (entidad_tipo, entidad_id) VALUES ('ticket', @0)`, [entidad]),
    ).resolves.toBeDefined();
  });
});

describe("ticket.solicitante_email: comparación case-insensitive (por la colación)", () => {
  it("la comparación no distingue mayúsculas", async () => {
    const t = await ticket("Ana.Perez@Test.CL");

    const porMinusculas = await sql(`SELECT id FROM ticket WHERE solicitante_email = 'ana.perez@test.cl'`);
    const porMayusculas = await sql(`SELECT id FROM ticket WHERE solicitante_email = 'ANA.PEREZ@TEST.CL'`);
    const porParametro = await sql(`SELECT id FROM ticket WHERE solicitante_email = @0`, ["ANA.perez@TEST.cl"]);

    expect(porMinusculas.map((r) => r.id)).toEqual([t]);
    expect(porMayusculas.map((r) => r.id)).toEqual([t]);
    expect(porParametro.map((r) => r.id)).toEqual([t]);
  });
});

describe("hora_trabajada.horas", () => {
  const insertar = (horas: number) =>
    sql(`INSERT INTO hora_trabajada (ot_id, usuario_id, fecha, horas) VALUES (@0, @1, '2026-09-21', @2)`, [
      otId,
      usuarioId,
      horas,
    ]);
  let otId: string;
  let usuarioId: string;

  beforeEach(async () => {
    otId = await ot();
    usuarioId = await usuario();
  });

  it.each([0, -1, 24.01, 25])("fuera de (0, 24] falla: %s", async (horas) => {
    await expect(insertar(horas)).rejects.toThrow(/hora_trabajada_horas_check/);
  });

  it.each([0.25, 8, 24])("dentro de (0, 24] pasa: %s", async (horas) => {
    await expect(insertar(horas)).resolves.toBeDefined();
  });
});
