import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppDataSource } from "../config/dataSource.js";
import { env } from "../config/env.js";
import { Rol } from "../entities/enums.js";
import { adjuntoFake, correoEntranteFake } from "../test/correoHelpers.js";
import { conectarBD, crearUsuarioSistemaTest, limpiarBD } from "../test/helpers.js";
import { crearSesionNombrada } from "../test/otHelpers.js";
import { crearEscenarioTicket, crearTicketApi } from "../test/ticketHelpers.js";
import { procesarMensajeEntrante, reprocesarCorreoIngerido } from "./correoIngerido.service.js";

beforeAll(conectarBD);
beforeEach(async () => {
  await limpiarBD();
  await crearUsuarioSistemaTest();
});
afterAll(() => AppDataSource.destroy());

const ORIGEN = "test";

async function filaCorreoIngerido(messageId: string) {
  const [fila] = await AppDataSource.query(
    `SELECT id, estado, ticket_id, error FROM correo_ingerido WHERE message_id = @0`,
    [messageId],
  );
  return fila as { id: string; estado: string; ticket_id: string | null; error: string | null } | undefined;
}

async function contarTickets(): Promise<number> {
  const [{ n }] = await AppDataSource.query(`SELECT COUNT(*) AS n FROM ticket`);
  return Number(n);
}

async function insertarMensajeConMessageId(ticketId: string, autorId: string, messageId: string) {
  await AppDataSource.query(
    `INSERT INTO mensaje_ticket (ticket_id, tipo, autor_id, cuerpo, message_id) VALUES (@0, 'respuesta_cliente', @1, 'hola', @2)`,
    [ticketId, autorId, messageId],
  );
}

describe("procesarMensajeEntrante", () => {
  it("idempotencia: el mismo messageId procesado dos veces no duplica nada", async () => {
    const correo = correoEntranteFake();
    const antes = await contarTickets();

    const r1 = await procesarMensajeEntrante(correo, ORIGEN);
    const r2 = await procesarMensajeEntrante(correo, ORIGEN);

    expect(r1).toBe("procesado");
    expect(r2).toBe("duplicado");
    expect(await contarTickets()).toBe(antes + 1);
    const [{ n }] = await AppDataSource.query(`SELECT COUNT(*) AS n FROM correo_ingerido WHERE message_id = @0`, [correo.messageId]);
    expect(Number(n)).toBe(1);
  });

  describe("descarta bucles (sin crear ni tocar ningún ticket)", () => {
    it.each([
      ["Auto-Submitted: auto-generated", { cabeceras: { "Auto-Submitted": "auto-generated" } }],
      ["Auto-Submitted: auto-replied", { cabeceras: { "Auto-Submitted": "auto-replied" } }],
      ["Precedence: bulk", { cabeceras: { Precedence: "bulk" } }],
      ["Precedence: auto_reply", { cabeceras: { Precedence: "auto_reply" } }],
      ["Content-Type: multipart/report (DSN)", { cabeceras: { "Content-Type": "multipart/report; report-type=delivery-status" } }],
    ] as const)("%s -> ignorado", async (_desc, overrides) => {
      const correo = correoEntranteFake(overrides);
      const antes = await contarTickets();

      const r = await procesarMensajeEntrante(correo, ORIGEN);

      expect(r).toBe("ignorado");
      expect(await contarTickets()).toBe(antes);
      const fila = await filaCorreoIngerido(correo.messageId);
      expect(fila?.estado).toBe("ignorado");
      expect(fila?.ticket_id).toBeNull();
    });

    it("remitente = SOPORTE_EMAIL -> ignorado", async () => {
      const correo = correoEntranteFake({ de: { nombre: null, email: env.mail.soporteEmail.toUpperCase() } });
      const antes = await contarTickets();

      const r = await procesarMensajeEntrante(correo, ORIGEN);

      expect(r).toBe("ignorado");
      expect(await contarTickets()).toBe(antes);
    });

    it("remitente mailer-daemon@... (rebote) -> ignorado", async () => {
      const correo = correoEntranteFake({ de: { nombre: null, email: "mailer-daemon@cliente.cl" } });
      const antes = await contarTickets();

      const r = await procesarMensajeEntrante(correo, ORIGEN);

      expect(r).toBe("ignorado");
      expect(await contarTickets()).toBe(antes);
    });

    it("Auto-Submitted: no -> NO es bucle (se procesa normalmente)", async () => {
      const correo = correoEntranteFake({ cabeceras: { "Auto-Submitted": "no" } });

      const r = await procesarMensajeEntrante(correo, ORIGEN);

      expect(r).toBe("procesado");
    });
  });

  it("threading por References/In-Reply-To contra mensaje_ticket.message_id", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_correo_thread");
    const ticket = await crearTicketApi(admin.auth);
    const messageIdOriginal = `<${randomUUID()}@siga-ot.local>`;
    await insertarMensajeConMessageId(ticket.id, admin.usuario.id, messageIdOriginal);
    const antes = await contarTickets();

    const correo = correoEntranteFake({ inReplyTo: messageIdOriginal, asunto: `Re: ${ticket.numero}` });
    const r = await procesarMensajeEntrante(correo, ORIGEN);

    expect(r).toBe("procesado");
    expect(await contarTickets()).toBe(antes); // no crea un ticket nuevo
    const fila = await filaCorreoIngerido(correo.messageId);
    expect(fila?.ticket_id?.toLowerCase()).toBe(ticket.id.toLowerCase());
  });

  it("threading por References (no solo In-Reply-To)", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_correo_refs");
    const ticket = await crearTicketApi(admin.auth);
    const messageIdOriginal = `<${randomUUID()}@siga-ot.local>`;
    await insertarMensajeConMessageId(ticket.id, admin.usuario.id, messageIdOriginal);

    const correo = correoEntranteFake({ referencias: [`<otro@x>`, messageIdOriginal] });
    const r = await procesarMensajeEntrante(correo, ORIGEN);

    expect(r).toBe("procesado");
    const fila = await filaCorreoIngerido(correo.messageId);
    expect(fila?.ticket_id?.toLowerCase()).toBe(ticket.id.toLowerCase());
  });

  it("threading por TK-\\d{4} en el asunto con remitente que coincide", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_correo_tk");
    const ticket = await crearTicketApi(admin.auth, { solicitanteEmail: "cliente@empresa.cl" });
    const antes = await contarTickets();

    const correo = correoEntranteFake({ asunto: `Re: [${ticket.numero}] algo más`, de: { nombre: null, email: "cliente@empresa.cl" } });
    const r = await procesarMensajeEntrante(correo, ORIGEN);

    expect(r).toBe("procesado");
    expect(await contarTickets()).toBe(antes);
    const fila = await filaCorreoIngerido(correo.messageId);
    expect(fila?.ticket_id?.toLowerCase()).toBe(ticket.id.toLowerCase());
  });

  it("TK-\\d{4} con remitente que NO coincide -> ticket nuevo, no secuestra el existente", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_correo_secuestro");
    const ticket = await crearTicketApi(admin.auth, { solicitanteEmail: "dueno@empresa.cl" });
    const antes = await contarTickets();

    const correo = correoEntranteFake({ asunto: `Re: [${ticket.numero}] algo más`, de: { nombre: null, email: "impostor@otra.cl" } });
    const r = await procesarMensajeEntrante(correo, ORIGEN);

    expect(r).toBe("procesado");
    expect(await contarTickets()).toBe(antes + 1); // creó un ticket nuevo
    const fila = await filaCorreoIngerido(correo.messageId);
    expect(fila?.ticket_id?.toLowerCase()).not.toBe(ticket.id.toLowerCase());
    const [{ n }] = await AppDataSource.query(`SELECT COUNT(*) AS n FROM mensaje_ticket WHERE ticket_id = @0`, [ticket.id]);
    expect(Number(n)).toBe(0); // el ticket original no fue tocado
  });

  it("ticket nuevo por correo: folio TK-xxxx, canal=correo, recepcionado_por=sistema, SLA calculado, sin mensaje inicial", async () => {
    const correo = correoEntranteFake({ asunto: "Necesito ayuda con la impresora" });

    const r = await procesarMensajeEntrante(correo, ORIGEN);

    expect(r).toBe("procesado");
    const fila = await filaCorreoIngerido(correo.messageId);
    expect(fila?.ticket_id).not.toBeNull();
    const [t] = await AppDataSource.query(
      `SELECT numero, canal, recepcionado_por_id, sla_resolucion_vence_en, solicitante_email FROM ticket WHERE id = @0`,
      [fila!.ticket_id],
    );
    expect(t.numero).toMatch(/^TK-\d{4}$/);
    expect(t.canal).toBe("correo");
    expect(t.sla_resolucion_vence_en).not.toBeNull();
    expect(t.solicitante_email).toBe(correo.de.email);
    const sistema = await AppDataSource.query(`SELECT id FROM usuario WHERE username = 'sistema'`);
    expect(t.recepcionado_por_id.toLowerCase()).toBe(sistema[0].id.toLowerCase());
    const [{ n }] = await AppDataSource.query(`SELECT COUNT(*) AS n FROM mensaje_ticket WHERE ticket_id = @0`, [fila!.ticket_id]);
    expect(Number(n)).toBe(0);
  });

  it("mensaje en ticket existente reabre esperando_cliente/resuelto y cierra la pausa, pero no reabre cerrado", async () => {
    const e = await crearEscenarioTicket(); // ticketId, numero, solicitanteEmail = "juan.perez@test.local"
    const cambiarEstado = (estado: string) =>
      AppDataSource.query(`UPDATE ticket SET estado = @0 WHERE id = @1`, [estado, e.ticketId]);

    // 1) esperando_cliente -> abierto, cierra la pausa
    await AppDataSource.query(`INSERT INTO sla_pausa (entidad_tipo, entidad_id, desde) VALUES ('ticket', @0, SYSDATETIMEOFFSET())`, [e.ticketId]);
    await cambiarEstado("esperando_cliente");
    const correo1 = correoEntranteFake({ asunto: `${e.numero} sigue el problema`, de: { nombre: null, email: "juan.perez@test.local" } });
    await procesarMensajeEntrante(correo1, ORIGEN);
    const [t1] = await AppDataSource.query(`SELECT estado FROM ticket WHERE id = @0`, [e.ticketId]);
    expect(t1.estado).toBe("abierto");
    const [pausa] = await AppDataSource.query(`SELECT hasta FROM sla_pausa WHERE entidad_tipo = 'ticket' AND entidad_id = @0`, [e.ticketId]);
    expect(pausa.hasta).not.toBeNull();

    // 2) resuelto -> abierto
    await cambiarEstado("resuelto");
    const correo2 = correoEntranteFake({ asunto: `${e.numero} de nuevo`, de: { nombre: null, email: "juan.perez@test.local" } });
    await procesarMensajeEntrante(correo2, ORIGEN);
    const [t2] = await AppDataSource.query(`SELECT estado FROM ticket WHERE id = @0`, [e.ticketId]);
    expect(t2.estado).toBe("abierto");

    // 3) cerrado -> NO se reabre
    await cambiarEstado("cerrado");
    const correo3 = correoEntranteFake({ asunto: `${e.numero} otra vez`, de: { nombre: null, email: "juan.perez@test.local" } });
    await procesarMensajeEntrante(correo3, ORIGEN);
    const [t3] = await AppDataSource.query(`SELECT estado FROM ticket WHERE id = @0`, [e.ticketId]);
    expect(t3.estado).toBe("cerrado");
  });

  it("adjunto fuera de la lista blanca se descarta sin tumbar el mensaje", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_correo_adjunto");
    const ticket = await crearTicketApi(admin.auth);
    const messageIdOriginal = `<${randomUUID()}@siga-ot.local>`;
    await insertarMensajeConMessageId(ticket.id, admin.usuario.id, messageIdOriginal);

    const correo = correoEntranteFake({
      inReplyTo: messageIdOriginal,
      adjuntos: [adjuntoFake({ nombre: "virus.exe", mime: "application/x-msdownload" })],
    });
    const r = await procesarMensajeEntrante(correo, ORIGEN);

    expect(r).toBe("procesado");
    const [msg] = await AppDataSource.query(`SELECT id FROM mensaje_ticket WHERE message_id = @0`, [correo.messageId]);
    expect(msg).toBeDefined();
    const [{ n }] = await AppDataSource.query(`SELECT COUNT(*) AS n FROM adjunto WHERE entidad_tipo = 'mensaje' AND entidad_id = @0`, [msg.id]);
    expect(Number(n)).toBe(0);
  });

  it("adjunto que SÍ pasa la lista blanca se guarda y liga al mensaje", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_correo_adjunto_ok");
    const ticket = await crearTicketApi(admin.auth);
    const messageIdOriginal = `<${randomUUID()}@siga-ot.local>`;
    await insertarMensajeConMessageId(ticket.id, admin.usuario.id, messageIdOriginal);

    const correo = correoEntranteFake({ inReplyTo: messageIdOriginal, adjuntos: [adjuntoFake({ nombre: "foto.jpg", mime: "image/jpeg" })] });
    await procesarMensajeEntrante(correo, ORIGEN);

    const [msg] = await AppDataSource.query(`SELECT id FROM mensaje_ticket WHERE message_id = @0`, [correo.messageId]);
    const [{ n }] = await AppDataSource.query(`SELECT COUNT(*) AS n FROM adjunto WHERE entidad_tipo = 'mensaje' AND entidad_id = @0`, [msg.id]);
    expect(Number(n)).toBe(1);
  });

  it("un error inesperado a mitad de camino deja el correo_ingerido en 'error' con el mensaje, sin tumbar el proceso", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_correo_error");
    const ticket = await crearTicketApi(admin.auth);
    const messageIdOriginal = `<${randomUUID()}@siga-ot.local>`;
    await insertarMensajeConMessageId(ticket.id, admin.usuario.id, messageIdOriginal);

    // 3 adjuntos de 9MB (cada uno bajo el tope de 10MB/archivo) suman 27MB > 25MB de cuota: el
    // tercero hace que verificarCuotaAdjunto lance, y a diferencia de la lista blanca, una cuota
    // excedida SÍ propaga el error (decisión documentada en correoIngerido.service.ts).
    const nueveMb = 9 * 1024 * 1024;
    const correo = correoEntranteFake({
      inReplyTo: messageIdOriginal,
      adjuntos: [
        adjuntoFake({ nombre: "a.pdf", mime: "application/pdf", tamano: nueveMb }),
        adjuntoFake({ nombre: "b.pdf", mime: "application/pdf", tamano: nueveMb }),
        adjuntoFake({ nombre: "c.pdf", mime: "application/pdf", tamano: nueveMb }),
      ],
    });

    const r = await procesarMensajeEntrante(correo, ORIGEN);

    expect(r).toBe("error");
    const fila = await filaCorreoIngerido(correo.messageId);
    expect(fila?.estado).toBe("error");
    expect(fila?.error).toContain("25 MB");
    // la transacción del mensaje se revirtió entera: ni el mensaje ni sus adjuntos quedaron
    const [{ n }] = await AppDataSource.query(`SELECT COUNT(*) AS n FROM mensaje_ticket WHERE message_id = @0`, [correo.messageId]);
    expect(Number(n)).toBe(0);
  }, 20000);
});

describe("reprocesarCorreoIngerido", () => {
  it("solo reprocesa si estado='error'; corre el mismo pipeline y no duplica la fila", async () => {
    const correo = correoEntranteFake();
    await procesarMensajeEntrante(correo, ORIGEN); // queda 'procesado'
    const fila = await filaCorreoIngerido(correo.messageId);

    await expect(reprocesarCorreoIngerido(fila!.id)).rejects.toMatchObject({ code: "CORREO_INGERIDO_NO_REPROCESABLE" });
  });

  it("reprocesa un correo en error usando el raw_ref guardado (sin volver a conectarse al buzón)", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_correo_reproc");
    const ticket = await crearTicketApi(admin.auth);
    const messageIdOriginal = `<${randomUUID()}@siga-ot.local>`;
    await insertarMensajeConMessageId(ticket.id, admin.usuario.id, messageIdOriginal);
    const nueveMb = 9 * 1024 * 1024;
    const correo = correoEntranteFake({
      inReplyTo: messageIdOriginal,
      adjuntos: [
        adjuntoFake({ nombre: "a.pdf", mime: "application/pdf", tamano: nueveMb }),
        adjuntoFake({ nombre: "b.pdf", mime: "application/pdf", tamano: nueveMb }),
        adjuntoFake({ nombre: "c.pdf", mime: "application/pdf", tamano: nueveMb }),
      ],
    });
    await procesarMensajeEntrante(correo, ORIGEN);
    const fila = await filaCorreoIngerido(correo.messageId);
    expect(fila?.estado).toBe("error");

    const resultado = await reprocesarCorreoIngerido(fila!.id);

    // Sigue fallando (mismo correo, mismo problema de cuota): lo importante es que NO duplicó la fila.
    expect(resultado.estado).toBe("error");
    const [{ n }] = await AppDataSource.query(`SELECT COUNT(*) AS n FROM correo_ingerido WHERE message_id = @0`, [correo.messageId]);
    expect(Number(n)).toBe(1);
  }, 20000);
});
