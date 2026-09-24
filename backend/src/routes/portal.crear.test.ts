import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { conectarBD, crearUsuarioSistemaTest, limpiarBD, obtenerPrioridadPorNombre } from "../test/helpers.js";
import { PORTAL, ticketPublicoBody } from "../test/portalHelpers.js";

beforeAll(conectarBD);
beforeEach(async () => {
  await limpiarBD();
  await crearUsuarioSistemaTest();
});
afterAll(async () => {
  await AppDataSource.destroy();
});

function crear(body: Record<string, unknown>) {
  let req = request(app).post(`${PORTAL}/tickets`);
  for (const [k, v] of Object.entries(body)) req = req.field(k, String(v));
  return req;
}

describe("POST /publico/tickets", () => {
  it("crea el ticket sin adjuntos: canal fijo, recepcionado_por=sistema, folio, SLA calculado, responde solo {numero}", async () => {
    const res = await crear(ticketPublicoBody());

    expect(res.status).toBe(201);
    expect(Object.keys(res.body.data)).toEqual(["numero"]);
    expect(res.body.data.numero).toMatch(/^TK-\d{4}$/);

    const [fila] = await AppDataSource.query(
      `SELECT ct.nombre AS canal, e.nombre AS estado, t.responsable_actual_id, p.nombre AS prioridad,
              t.sla_resolucion_vence_en, t.sla_respuesta_vence_en, u.username AS recepcionado_por_username
       FROM ticket t
       JOIN canal_ticket ct ON ct.id = t.canal_id
       JOIN estado_ticket e ON e.id = t.estado_id
       JOIN prioridad p ON p.id = t.prioridad_id
       JOIN usuario u ON u.id = t.recepcionado_por_id
       WHERE t.numero = @0`,
      [res.body.data.numero],
    );
    expect(fila.canal).toBe("Portal");
    expect(fila.estado).toBe("Nuevo");
    expect(fila.responsable_actual_id).toBeNull();
    expect(fila.prioridad).toBe("Media"); // default
    expect(fila.recepcionado_por_username).toBe("sistema");
    expect(fila.sla_resolucion_vence_en).not.toBeNull();
    expect(fila.sla_respuesta_vence_en).not.toBeNull();
  });

  it("ignora canal/recepcionadoPorId si alguien los manda (campos no previstos: 400)", async () => {
    const res = await crear(ticketPublicoBody({ canal: "correo" }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("acepta prioridad y empresa explícitas", async () => {
    const alta = await obtenerPrioridadPorNombre("Alta");
    const res = await crear(ticketPublicoBody({ prioridadId: alta.id, empresa: "Cliente SPA" }));
    expect(res.status).toBe(201);
    const [fila] = await AppDataSource.query(
      `SELECT p.nombre AS prioridad, t.solicitante_empresa FROM ticket t JOIN prioridad p ON p.id = t.prioridad_id WHERE t.numero = @0`,
      [res.body.data.numero],
    );
    expect(fila.prioridad).toBe("Alta");
    expect(fila.solicitante_empresa).toBe("Cliente SPA");
  });

  it("con un adjunto válido: se guarda ligado al ticket (entidadTipo=ticket)", async () => {
    const body = ticketPublicoBody();
    let req = request(app).post(`${PORTAL}/tickets`);
    for (const [k, v] of Object.entries(body)) req = req.field(k, String(v));
    const res = await req.attach("adjuntos", Buffer.from("%PDF-1.4 x"), { filename: "evidencia.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(201);
    const [adj] = await AppDataSource.query(
      `SELECT a.entidad_tipo, a.entidad_id, a.nombre FROM adjunto a JOIN ticket t ON t.id = a.entidad_id WHERE t.numero = @0`,
      [res.body.data.numero],
    );
    expect(adj.entidad_tipo).toBe("ticket");
    expect(adj.nombre).toBe("evidencia.pdf");
  });

  it("captchaToken faltante: 400 con código claro", async () => {
    const { captchaToken: _omitido, ...resto } = ticketPublicoBody();
    const res = await crear(resto);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(JSON.stringify(res.body.details)).toContain("captchaToken");
  });

  it("se encolan 2 correos (autorespuesta + aviso a soporte), con Message-ID/X-SIGA-Ticket propios", async () => {
    const res = await crear(ticketPublicoBody());
    const numero = res.body.data.numero as string;

    const correos: Array<{ plantilla: string; para: string; headers: string }> = await AppDataSource.query(
      `SELECT plantilla, para, headers FROM correo_saliente WHERE JSON_VALUE(headers, '$."X-SIGA-Ticket"') = @0 ORDER BY creado_en`,
      [numero],
    );
    expect(correos).toHaveLength(2);
    expect(correos.map((c) => c.plantilla)).toEqual(["ticket_creado", "aviso_soporte"]);
    expect(correos[0]!.para).toBe("juan.perez@cliente.cl");
    const h0 = JSON.parse(correos[0]!.headers);
    const h1 = JSON.parse(correos[1]!.headers);
    expect(h0["Message-ID"]).toMatch(/^<.+@.+>$/);
    expect(h1["Message-ID"]).toMatch(/^<.+@.+>$/);
    expect(h0["Message-ID"]).not.toBe(h1["Message-ID"]);
    // el segundo encadena References con el Message-ID del primero
    expect(h1["References"]).toBe(h0["Message-ID"]);
    expect(h1["Auto-Submitted"]).toBe("auto-generated");
    expect(h0["Auto-Submitted"]).toBeUndefined();

    const [{ total }] = await AppDataSource.query(`SELECT COUNT(*) AS total FROM correo_saliente WHERE estado = 'pendiente'`);
    expect(Number(total)).toBe(2);
  });

  it("rate limit: la ruta está protegida por un limitador (mecanismo probado aparte, ver portal.ratelimit.test.ts)", async () => {
    // En NODE_ENV=test el limitador se salta (mismo patrón que loginRateLimiter) para no
    // interferir con el resto de la suite; aquí solo se confirma que la ruta sigue respondiendo
    // con normalidad más allá de 5 solicitudes.
    for (let i = 0; i < 6; i++) {
      const res = await crear(ticketPublicoBody());
      expect(res.status).toBe(201);
    }
  });
});
