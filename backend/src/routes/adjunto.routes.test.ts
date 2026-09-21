import { createHash } from "node:crypto";
import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { conectarBD, limpiarBD } from "../test/helpers.js";
import { API, crearEscenario, type Escenario } from "../test/otHelpers.js";
import { advertirSiNoHayAntivirus, NoopAntivirus } from "../storage/antivirus.js";
import { LocalFileStorage } from "../storage/local.storage.js";

beforeAll(conectarBD);
beforeEach(async () => {
  await limpiarBD();
  await rm(env.adjuntosDir, { recursive: true, force: true });
});
afterAll(async () => {
  await rm(env.adjuntosDir, { recursive: true, force: true });
  await AppDataSource.destroy();
});

const PDF = Buffer.from("%PDF-1.4 contenido de prueba");
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

function subir(auth: string | null, otId: string, archivo: { nombre: string; tipo: string; datos: Buffer }, campos: Record<string, string> = {}) {
  const r = request(app).post(`${API}/adjuntos`);
  if (auth) r.set("Authorization", auth);
  const c = { entidadTipo: "ot", entidadId: otId, ...campos };
  for (const [k, v] of Object.entries(c)) r.field(k, v);
  return r.attach("archivo", archivo.datos, { filename: archivo.nombre, contentType: archivo.tipo });
}
const pdf = (nombre = "informe.pdf", datos = PDF) => ({ nombre, tipo: "application/pdf", datos });

async function archivosEnDisco(): Promise<string[]> {
  return readdir(env.adjuntosDir).catch(() => []);
}

describe("POST /adjuntos", () => {
  it("guarda el archivo con el sha256 como nombre y devuelve un DTO sin campos internos", async () => {
    const e = await crearEscenario();

    const res = await subir(e.resp.auth, e.otId, pdf());

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      id: expect.any(String),
      nombre: "informe.pdf",
      mime: "application/pdf",
      tamanoBytes: PDF.length,
      estado: "limpio", // NoopAntivirus
      subidoPor: { id: e.resp.usuario.id, nombre: e.resp.usuario.nombre },
      creadoEn: expect.any(String),
    });
    expect(await archivosEnDisco()).toEqual([sha(PDF)]);
    expect((await readFile(path.join(env.adjuntosDir, sha(PDF)))).equals(PDF)).toBe(true);
    const [fila] = await AppDataSource.query(`SELECT storage_key, sha256 FROM adjunto`);
    expect(fila.storage_key).toBe(sha(PDF));
    expect(String(fila.sha256).trim()).toBe(sha(PDF));
    // evento
    const ev = await AppDataSource.query(`SELECT payload FROM evento WHERE tipo = 'adjunto_agregado'`);
    expect(JSON.parse(ev[0].payload)).toEqual({ adjuntoId: res.body.data.id, mime: "application/pdf", tamanoBytes: PDF.length });
    expect(JSON.stringify(res.body)).not.toContain(sha(PDF));
  });

  it("aparece en el detalle de la OT y en adjuntosCount del kanban", async () => {
    const e = await crearEscenario();
    await subir(e.admin.auth, e.otId, pdf());
    await subir(e.admin.auth, e.otId, { nombre: "foto.png", tipo: "image/png", datos: Buffer.from("png") });

    const detalle = await request(app).get(`${API}/ots/${e.otId}`).set("Authorization", e.lectura.auth);
    const kanban = await request(app).get(`${API}/ots/kanban`).set("Authorization", e.lectura.auth);

    expect(detalle.body.data.adjuntos.map((a: { nombre: string }) => a.nombre)).toEqual(["informe.pdf", "foto.png"]);
    expect(kanban.body.data[0].ots[0].adjuntosCount).toBe(2);
  });

  it("el mismo contenido subido dos veces comparte archivo en disco pero son dos adjuntos", async () => {
    const e = await crearEscenario();
    await subir(e.admin.auth, e.otId, pdf("a.pdf"));
    await subir(e.admin.auth, e.otId, pdf("b.pdf"));

    expect(await archivosEnDisco()).toHaveLength(1);
    expect(await AppDataSource.query(`SELECT 1 FROM adjunto`)).toHaveLength(2);
  });

  it.each([
    ["ejecutable", "virus.exe", "application/octet-stream"],
    ["html", "pagina.html", "text/html"],
    ["svg", "imagen.svg", "image/svg+xml"],
    ["doble extensión", "informe.pdf.exe", "application/pdf"],
    ["sin extensión", "informe", "application/pdf"],
    ["MIME que no corresponde a la extensión", "informe.pdf", "text/html"],
    ["extensión válida con MIME genérico", "informe.pdf", "application/octet-stream"],
    ["solo puntos", "..", "application/pdf"],
  ])("415: %s", async (_n, nombre, tipo) => {
    const e = await crearEscenario();

    const res = await subir(e.admin.auth, e.otId, { nombre, tipo, datos: PDF });

    expect(res.status).toBe(415);
    expect(res.body.code).toBe("ADJUNTO_TIPO_NO_PERMITIDO");
    expect(await archivosEnDisco()).toEqual([]);
    expect(await AppDataSource.query(`SELECT 1 FROM adjunto`)).toHaveLength(0);
  });

  it("acepta las extensiones de la lista blanca con su MIME", async () => {
    const e = await crearEscenario();
    const casos: Array<[string, string]> = [
      ["a.png", "image/png"], ["a.jpg", "image/jpeg"], ["a.jpeg", "image/jpeg"], ["a.gif", "image/gif"], ["a.webp", "image/webp"],
      ["a.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      ["a.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
      ["a.txt", "text/plain; charset=utf-8"], ["a.csv", "text/csv"], ["a.zip", "application/zip"],
    ];
    for (const [i, [nombre, tipo]] of casos.entries()) {
      const res = await subir(e.admin.auth, e.otId, { nombre: nombre.toUpperCase().replace(".", i + "."), tipo, datos: Buffer.from(`x${i}`) });
      expect(res.status, nombre).toBe(201);
    }
  });

  it("un nombre con ../ no permite traversal: se sanea y el disco solo tiene nombres sha256", async () => {
    const e = await crearEscenario();

    const a = await subir(e.admin.auth, e.otId, pdf("../../evil.pdf", Buffer.from("uno")));
    const b = await subir(e.admin.auth, e.otId, pdf("..\\..\\windows\\evil2.pdf", Buffer.from("dos")));
    const c = await subir(e.admin.auth, e.otId, pdf("..\\..\\boot.ini", Buffer.from("tres")));

    expect(a.status).toBe(201);
    expect(a.body.data.nombre).toBe("evil.pdf");
    expect(b.body.data.nombre).toBe("evil2.pdf");
    expect(c.status).toBe(415);
    const archivos = await archivosEnDisco();
    expect(archivos).toHaveLength(2);
    for (const f of archivos) expect(f).toMatch(/^[a-f0-9]{64}$/);
    // nada escapó del directorio de adjuntos
    expect(await readdir(path.resolve(env.adjuntosDir, ".."))).not.toContain("evil.pdf");
  });

  it("más de 10 MB: 413 ADJUNTO_MUY_GRANDE y nada queda en disco", async () => {
    const e = await crearEscenario();

    const res = await subir(e.admin.auth, e.otId, pdf("grande.pdf", Buffer.alloc(10 * 1024 * 1024 + 1, 1)));

    expect(res.status).toBe(413);
    expect(res.body.code).toBe("ADJUNTO_MUY_GRANDE");
    expect(await archivosEnDisco()).toEqual([]);
  });

  it("exactamente 10 MB se acepta; el tope de 25 MB por OT da 413 ADJUNTO_CUOTA_EXCEDIDA", async () => {
    const e = await crearEscenario();
    const uno = (n: number) => Buffer.alloc(10 * 1024 * 1024, n);

    const a = await subir(e.admin.auth, e.otId, pdf("a.pdf", uno(1)));
    const b = await subir(e.admin.auth, e.otId, pdf("b.pdf", uno(2)));
    const c = await subir(e.admin.auth, e.otId, pdf("c.pdf", uno(3))); // 30 MB en total
    const chico = await subir(e.admin.auth, e.otId, pdf("d.pdf", Buffer.alloc(5 * 1024 * 1024, 4))); // 25 MB justo

    expect([a.status, b.status]).toEqual([201, 201]);
    expect(c.status).toBe(413);
    expect(c.body.code).toBe("ADJUNTO_CUOTA_EXCEDIDA");
    expect(chico.status).toBe(201);
    expect(await AppDataSource.query(`SELECT 1 FROM adjunto`)).toHaveLength(3);
  });

  it("validaciones del multipart", async () => {
    const e = await crearEscenario();
    const sinArchivo = await request(app).post(`${API}/adjuntos`).set("Authorization", e.admin.auth).field("entidadTipo", "ot").field("entidadId", e.otId);
    const ticket = await subir(e.admin.auth, e.otId, pdf(), { entidadTipo: "ticket" });
    const idMalo = await subir(e.admin.auth, "no-uuid", pdf());
    const inexistente = await subir(e.admin.auth, "11111111-1111-4111-8111-111111111111", pdf());
    const campoIncorrecto = await request(app)
      .post(`${API}/adjuntos`)
      .set("Authorization", e.admin.auth)
      .field("entidadTipo", "ot")
      .field("entidadId", e.otId)
      .attach("file", PDF, { filename: "x.pdf", contentType: "application/pdf" });
    const vacio = await subir(e.admin.auth, e.otId, pdf("vacio.pdf", Buffer.alloc(0)));
    const json = await request(app).post(`${API}/adjuntos`).set("Authorization", e.admin.auth).send({ entidadTipo: "ot", entidadId: e.otId });

    expect(sinArchivo.status).toBe(400);
    expect(ticket.status).toBe(400);
    expect(idMalo.status).toBe(400);
    expect(inexistente.status).toBe(404);
    expect(inexistente.body.code).toBe("OT_NO_ENCONTRADA");
    expect(campoIncorrecto.status).toBe(400);
    expect(vacio.status).toBe(400);
    expect(json.status).toBe(400);
  });

  it("permisos: tecnico solo si es responsable/colaborador; lectura no sube; sin token 401", async () => {
    const e = await crearEscenario();

    const resp = await subir(e.resp.auth, e.otId, pdf("1.pdf", Buffer.from("1")));
    const colab = await subir(e.colab.auth, e.otId, pdf("2.pdf", Buffer.from("2")));
    const ajeno = await subir(e.ajeno.auth, e.otId, pdf("3.pdf", Buffer.from("3")));
    const lectura = await subir(e.lectura.auth, e.otId, pdf("4.pdf", Buffer.from("4")));
    const anon = await subir(null, e.otId, pdf("5.pdf", Buffer.from("5")));

    expect([resp.status, colab.status, ajeno.status, lectura.status, anon.status]).toEqual([201, 201, 403, 403, 401]);
    expect(await archivosEnDisco()).toHaveLength(2); // los rechazados no escribieron nada
  });
});

describe("GET /adjuntos/:id/descargar", () => {
  async function conAdjunto(e: Escenario) {
    const res = await subir(e.admin.auth, e.otId, pdf("informe final.pdf"));
    return res.body.data.id as string;
  }
  const descargar = (auth: string | null, id: string) => {
    const r = request(app).get(`${API}/adjuntos/${id}/descargar`).buffer(true).parse((res, cb) => {
      const trozos: Buffer[] = [];
      res.on("data", (t: Buffer) => trozos.push(t));
      res.on("end", () => cb(null, Buffer.concat(trozos)));
    });
    return auth ? r.set("Authorization", auth) : r;
  };

  it("entrega el contenido con las cabeceras de seguridad", async () => {
    const e = await crearEscenario();
    const id = await conAdjunto(e);

    const res = await descargar(e.lectura.auth, id);

    expect(res.status).toBe(200);
    expect((res.body as Buffer).equals(PDF)).toBe(true);
    expect(res.headers["content-disposition"]).toMatch(/^attachment; filename="informe final\.pdf"/);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toBe("sandbox");
    expect(res.headers["content-length"]).toBe(String(PDF.length));
  });

  it("sin token: 401; con cualquier rol autenticado: 200", async () => {
    const e = await crearEscenario();
    const id = await conAdjunto(e);

    expect((await descargar(null, id)).status).toBe(401);
    for (const s of [e.admin, e.gestion, e.resp, e.ajeno, e.lectura]) expect((await descargar(s.auth, id)).status).toBe(200);
  });

  it("404 si no existe o id mal formado (400); 409 si no está limpio; 404 si falta el archivo en disco", async () => {
    const e = await crearEscenario();
    const id = await conAdjunto(e);

    expect((await descargar(e.admin.auth, "11111111-1111-4111-8111-111111111111")).status).toBe(404);
    expect((await descargar(e.admin.auth, "no-uuid")).status).toBe(400);

    await AppDataSource.query(`UPDATE adjunto SET estado = 'infectado' WHERE id = @0`, [id]);
    const infectado = await descargar(e.admin.auth, id);
    expect(infectado.status).toBe(409);

    await AppDataSource.query(`UPDATE adjunto SET estado = 'limpio' WHERE id = @0`, [id]);
    await rm(env.adjuntosDir, { recursive: true, force: true });
    expect((await descargar(e.admin.auth, id)).status).toBe(404);
  });
});

describe("almacenamiento y antivirus", () => {
  it("LocalFileStorage rechaza claves que no sean sha256 en hex (sin traversal)", async () => {
    const st = new LocalFileStorage(path.join(env.adjuntosDir, "unit"));
    for (const clave of ["../x", "..\\x", "abc", `${"a".repeat(63)}/`, `${"g".repeat(64)}`, "a".repeat(64) + ".."]) {
      await expect(st.guardar(clave, Buffer.from("x"))).rejects.toThrow("Clave de almacenamiento inválida");
      await expect(st.abrirLectura(clave)).rejects.toThrow("Clave de almacenamiento inválida");
    }
  });

  it("NoopAntivirus deja limpio y advierte al arrancar que no hay antivirus real", async () => {
    const av = new NoopAntivirus();
    const aviso = vi.spyOn(logger, "warn").mockImplementation(() => undefined);

    expect(await av.escanear()).toBe("limpio");
    expect(av.real).toBe(false);
    advertirSiNoHayAntivirus(av);

    expect(aviso).toHaveBeenCalledOnce();
    expect(String(aviso.mock.calls[0]![0])).toContain("SIN escanearse");
    aviso.mockRestore();
  });
});
