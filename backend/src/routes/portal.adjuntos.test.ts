import { rm } from "node:fs/promises";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { env } from "../config/env.js";
import { Rol } from "../entities/enums.js";
import { conectarBD, crearUsuarioSistemaTest, limpiarBD } from "../test/helpers.js";
import { API, crearSesionNombrada } from "../test/otHelpers.js";
import { crearTicketPublicoApi, PORTAL, tokenPortalTest } from "../test/portalHelpers.js";

beforeAll(conectarBD);
beforeEach(async () => {
  await limpiarBD();
  await rm(env.adjuntosDir, { recursive: true, force: true });
  await crearUsuarioSistemaTest();
});
afterAll(async () => {
  await rm(env.adjuntosDir, { recursive: true, force: true });
  await AppDataSource.destroy();
});

const PDF = Buffer.from("%PDF-1.4 contenido de prueba");

async function ticketPortal() {
  const { numero } = await crearTicketPublicoApi();
  const [fila] = await AppDataSource.query(`SELECT id FROM ticket WHERE numero = @0`, [numero]);
  const ticketId = (fila.id as string).toLowerCase();
  return { numero, ticketId, auth: tokenPortalTest(ticketId) };
}

function subir(auth: string, datos = PDF, nombre = "evidencia.pdf", tipo = "application/pdf") {
  return request(app).post(`${PORTAL}/adjuntos`).set("Authorization", auth).attach("archivo", datos, { filename: nombre, contentType: tipo });
}

function descargar(auth: string, id: string) {
  return request(app)
    .get(`${PORTAL}/adjuntos/${id}/descargar`)
    .set("Authorization", auth)
    .buffer(true)
    .parse((res, cb) => {
      const trozos: Buffer[] = [];
      res.on("data", (t: Buffer) => trozos.push(t));
      res.on("end", () => cb(null, Buffer.concat(trozos)));
    });
}

describe("POST /publico/adjuntos", () => {
  it("sube un archivo suelto al ticket del token y devuelve solo {id}", async () => {
    const t = await ticketPortal();
    const res = await subir(t.auth);

    expect(res.status).toBe(201);
    expect(Object.keys(res.body.data)).toEqual(["id"]);
    const [fila] = await AppDataSource.query(`SELECT entidad_tipo, entidad_id FROM adjunto WHERE id = @0`, [res.body.data.id]);
    expect(fila.entidad_tipo).toBe("ticket");
    expect((fila.entidad_id as string).toLowerCase()).toBe(t.ticketId);
  });

  it("respeta la lista blanca de tipos (415) y el tope de 10 MB (413)", async () => {
    const t = await ticketPortal();
    const tipoInvalido = await subir(t.auth, PDF, "virus.exe", "application/octet-stream");
    const grande = await subir(t.auth, Buffer.alloc(10 * 1024 * 1024 + 1, 1), "grande.pdf");

    expect(tipoInvalido.status).toBe(415);
    expect(grande.status).toBe(413);
  });

  it("respeta la cuota de 25 MB por ticket", async () => {
    const t = await ticketPortal();
    const diez = (n: number) => Buffer.alloc(10 * 1024 * 1024, n);
    await subir(t.auth, diez(1), "a.pdf");
    await subir(t.auth, diez(2), "b.pdf");
    const c = await subir(t.auth, diez(3), "c.pdf"); // 30 MB en total

    expect(c.status).toBe(413);
    expect(c.body.code).toBe("ADJUNTO_CUOTA_EXCEDIDA");
  });

  it("sin token de portal: 401", async () => {
    const res = await request(app).post(`${PORTAL}/adjuntos`).attach("archivo", PDF, { filename: "x.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(401);
  });
});

describe("GET /publico/adjuntos/:id/descargar", () => {
  it("descarga un adjunto suelto del propio ticket", async () => {
    const t = await ticketPortal();
    const subida = await subir(t.auth);

    const res = await descargar(t.auth, subida.body.data.id);

    expect(res.status).toBe(200);
    expect((res.body as Buffer).equals(PDF)).toBe(true);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("404 si el adjunto está ligado a una nota_interna, aunque el id sea válido y del mismo ticket", async () => {
    const tecnico = await crearSesionNombrada(Rol.TECNICO, "tecnico_adj_nota");
    const t = await ticketPortal();
    await request(app).post(`${API}/tickets/${t.ticketId}/tomar`).set("Authorization", tecnico.auth);
    const mensaje = await request(app)
      .post(`${API}/tickets/${t.ticketId}/mensajes`)
      .set("Authorization", tecnico.auth)
      .send({ tipo: "nota_interna", cuerpo: "nota interna" });
    const mensajeId = mensaje.body.data.id as string;
    // Adjunto directo a ese mensaje (entidadTipo=mensaje), mismo camino que usa el panel interno.
    const adj = await request(app)
      .post(`${API}/adjuntos`)
      .set("Authorization", tecnico.auth)
      .field("entidadTipo", "mensaje")
      .field("entidadId", mensajeId)
      .attach("archivo", PDF, { filename: "interno.pdf", contentType: "application/pdf" });
    expect(adj.status).toBe(201);

    const res = await descargar(t.auth, adj.body.data.id);
    expect(res.status).toBe(404);
  });

  it("descarga un adjunto ligado a una respuesta_cliente (visible para el portal)", async () => {
    const tecnico = await crearSesionNombrada(Rol.TECNICO, "tecnico_adj_resp");
    const t = await ticketPortal();
    await request(app).post(`${API}/tickets/${t.ticketId}/tomar`).set("Authorization", tecnico.auth);
    const mensaje = await request(app)
      .post(`${API}/tickets/${t.ticketId}/mensajes`)
      .set("Authorization", tecnico.auth)
      .send({ tipo: "respuesta_cliente", cuerpo: "revisa el adjunto" });
    const mensajeId = mensaje.body.data.id as string;
    const adj = await request(app)
      .post(`${API}/adjuntos`)
      .set("Authorization", tecnico.auth)
      .field("entidadTipo", "mensaje")
      .field("entidadId", mensajeId)
      .attach("archivo", PDF, { filename: "respuesta.pdf", contentType: "application/pdf" });

    const res = await descargar(t.auth, adj.body.data.id);
    expect(res.status).toBe(200);
  });

  it("404 si el adjunto pertenece a OTRO ticket", async () => {
    const a = await ticketPortal();
    const b = await ticketPortal();
    const subida = await subir(a.auth);

    const res = await descargar(b.auth, subida.body.data.id);
    expect(res.status).toBe(404);
  });

  it("404 si el adjunto pertenece a una OT", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_adj_ot");
    const cliente = await AppDataSource.query(`SELECT TOP 1 id FROM cliente`);
    const clienteId = cliente[0]
      ? (cliente[0].id as string)
      : ((await AppDataSource.query(`INSERT INTO cliente (nombre) OUTPUT inserted.id VALUES ('Cliente adj ot test')`))[0].id as string);
    const ot = await request(app)
      .post(`${API}/ots`)
      .set("Authorization", gestion.auth)
      .send({ titulo: "OT test", descripcion: "desc", clienteId, categoria: "soporte", prioridad: "media", origen: "telefono" });
    const adj = await request(app)
      .post(`${API}/adjuntos`)
      .set("Authorization", gestion.auth)
      .field("entidadTipo", "ot")
      .field("entidadId", ot.body.data.id)
      .attach("archivo", PDF, { filename: "ot.pdf", contentType: "application/pdf" });

    const t = await ticketPortal();
    const res = await descargar(t.auth, adj.body.data.id);
    expect(res.status).toBe(404);
  });

  it("404 si el id no existe; sin token: 401", async () => {
    const t = await ticketPortal();
    const inexistente = await descargar(t.auth, "11111111-1111-4111-8111-111111111111");
    expect(inexistente.status).toBe(404);
    const sinToken = await request(app).get(`${PORTAL}/adjuntos/11111111-1111-4111-8111-111111111111/descargar`);
    expect(sinToken.status).toBe(401);
  });
});
