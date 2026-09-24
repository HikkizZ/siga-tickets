import { createHash, randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import sanitizeHtml from "sanitize-html";
import { AppDataSource } from "../config/dataSource.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { CanalTicket } from "../entities/CanalTicket.js";
import { CorreoIngerido } from "../entities/CorreoIngerido.js";
import { EstadoTicket } from "../entities/EstadoTicket.js";
import { MensajeTicket } from "../entities/MensajeTicket.js";
import { Prioridad } from "../entities/Prioridad.js";
import { Ticket } from "../entities/Ticket.js";
import { EntidadAdjunto, EstadoCorreoIngerido, TipoMensajeTicket } from "../entities/enums.js";
import { AppError } from "../errors/AppError.js";
import { violacionUnica } from "../errors/dbErrors.js";
import type { CorreoEntrante } from "../mail/ingest/MailboxSource.js";
import { fileStorage } from "../storage/index.js";
import { guardarAdjunto, validarArchivo, verificarCuotaAdjunto } from "./adjunto.service.js";
import { registrarEventoTicket } from "./evento.service.js";
import { enTransaccion, siguienteFolio, type ManagerTransaccional } from "./folio.service.js";
import { calcularVencimientosTicket } from "./sla.calculo.service.js";
import { bloquearTicket, reabrirTicketSiCorresponde } from "./ticket.common.js";
import { obtenerUsuarioSistemaId } from "./usuarioSistema.service.js";

// ------------------------------------------------------------------ raw_ref: guardar/leer el correo crudo
//
// El pipeline solo ve CorreoEntrante (ya parseado): MailboxSource es la única pieza que toca MIME
// crudo (ImapMailboxSource usa mailparser una sola vez, antes de que el mensaje entre aquí). Por
// eso raw_ref guarda una serialización JSON de CorreoEntrante (la alternativa que el encargo deja
// explícita en el punto 3.a: "o reconstruye uno equivalente serializando CorreoEntrante"), no el
// MIME original: es lo único disponible en este límite, y es igual de válida para el
// reprocesamiento manual (punto 6), que reconstruye el mismo objeto sin volver a conectarse al
// buzón. Los adjuntos (Buffer) se codifican en base64 dentro del JSON.
function serializarCorreoEntrante(correo: CorreoEntrante): Buffer {
  const plano = {
    ...correo,
    adjuntos: correo.adjuntos.map((a) => ({ nombre: a.nombre, mime: a.mime, buffer: a.buffer.toString("base64") })),
  };
  return Buffer.from(JSON.stringify(plano), "utf8");
}

function deserializarCorreoEntrante(buf: Buffer): CorreoEntrante {
  const plano = JSON.parse(buf.toString("utf8")) as Omit<CorreoEntrante, "adjuntos" | "recibidoEn"> & {
    adjuntos: Array<{ nombre: string; mime: string; buffer: string }>;
    recibidoEn: string;
  };
  return {
    ...plano,
    recibidoEn: new Date(plano.recibidoEn),
    adjuntos: plano.adjuntos.map((a) => ({ nombre: a.nombre, mime: a.mime, buffer: Buffer.from(a.buffer, "base64") })),
  };
}

async function bufferDesdeStream(stream: Readable): Promise<Buffer> {
  const trozos: Buffer[] = [];
  for await (const trozo of stream) trozos.push(trozo as Buffer);
  return Buffer.concat(trozos);
}

// ------------------------------------------------------------------ paso b: descartar bucles

// Busca una cabecera por nombre sin importar mayúsculas/minúsculas (los nombres de cabecera de
// correo son case-insensitive; CorreoEntrante.cabeceras no garantiza una capitalización fija entre
// implementaciones de MailboxSource).
function cabecera(correo: CorreoEntrante, nombre: string): string | null {
  const buscado = nombre.toLowerCase();
  for (const [clave, valor] of Object.entries(correo.cabeceras)) {
    if (clave.toLowerCase() === buscado) return valor;
  }
  return null;
}

// Punto 3.b del encargo: cada señal por separado. Nunca crea ni toca ningún ticket.
function esBucle(correo: CorreoEntrante): boolean {
  const autoSubmitted = cabecera(correo, "Auto-Submitted");
  if (autoSubmitted && autoSubmitted.trim().toLowerCase() !== "no") return true;

  const precedence = cabecera(correo, "Precedence")?.trim().toLowerCase();
  if (precedence === "bulk" || precedence === "auto_reply") return true;

  if (correo.de.email.toLowerCase() === env.mail.soporteEmail.toLowerCase()) return true;

  const contentType = cabecera(correo, "Content-Type")?.toLowerCase();
  if (contentType?.includes("multipart/report")) return true;

  if (correo.de.email.toLowerCase().startsWith("mailer-daemon@")) return true;

  return false;
}

// ------------------------------------------------------------------ paso c: threading

const REGEX_NUMERO_TICKET = /TK-\d{4}/;

// In-Reply-To / References contra mensaje_ticket.message_id (coincidencia exacta) primero; si no
// hay match, TK-\d{4} en el asunto validando que el remitente coincida con el solicitante del
// ticket (si no coincide, se trata como ticket nuevo: no se deja secuestrar un ticket ajeno solo
// por poner su número en el asunto). null = ticket nuevo.
async function resolverTicketExistente(manager: ManagerTransaccional, correo: CorreoEntrante): Promise<string | null> {
  const candidatos = [correo.inReplyTo, ...correo.referencias].filter((x): x is string => !!x);
  if (candidatos.length > 0) {
    const placeholders = candidatos.map((_, i) => `@${i}`).join(", ");
    const filas: Array<{ ticket_id: string }> = await manager.query(
      `SELECT TOP 1 ticket_id FROM mensaje_ticket WHERE message_id IN (${placeholders}) ORDER BY creado_en ASC`,
      candidatos,
    );
    if (filas[0]?.ticket_id) return filas[0].ticket_id.toLowerCase();
  }

  const match = correo.asunto.match(REGEX_NUMERO_TICKET);
  if (match) {
    const ticket = await manager.findOne(Ticket, { where: { numero: match[0] } });
    if (ticket && ticket.solicitanteEmail.toLowerCase() === correo.de.email.toLowerCase()) {
      return ticket.id;
    }
  }

  return null;
}

// ------------------------------------------------------------------ adjuntos (paso f)

function recortar(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

// Un adjunto de correo que no pasa la lista blanca de validarArchivo se descarta EN SILENCIO (se
// deja constancia solo en el log): a diferencia de una subida por API, no tiene sentido rechazar
// todo el mensaje por un adjunto que el remitente ni siquiera controla directamente (firmas con
// imágenes raras, etc.). Cuota/antivirus/almacenamiento SÍ propagan el error (no están en la lista
// del encargo como "se descartan en silencio"): si fallan, todo el mensaje cae a estado='error'
// para revisión manual, en vez de perder evidencia silenciosamente.
async function procesarAdjuntoEntrante(
  manager: ManagerTransaccional,
  entidadTipo: EntidadAdjunto,
  entidadId: string,
  adjunto: CorreoEntrante["adjuntos"][number],
  actorId: string,
  ticketIdParaEvento: string,
): Promise<void> {
  let validado;
  try {
    validado = validarArchivo({ originalname: adjunto.nombre, mimetype: adjunto.mime, buffer: adjunto.buffer });
  } catch (err) {
    logger.warn({ nombre: adjunto.nombre, mime: adjunto.mime, err: err instanceof Error ? err.message : String(err) }, "Adjunto de correo descartado: no pasa la lista blanca");
    return;
  }
  await verificarCuotaAdjunto(manager, entidadTipo, entidadId, validado.tamano);
  const a = await guardarAdjunto(manager, entidadTipo, entidadId, validado, null);
  await registrarEventoTicket(manager, ticketIdParaEvento, actorId, { tipo: "adjunto_agregado", adjuntoId: a.id, mime: a.mime, tamanoBytes: a.tamanoBytes });
}

// ------------------------------------------------------------------ paso d: ticket existente

async function agregarMensajeATicketExistente(manager: ManagerTransaccional, ticketId: string, correo: CorreoEntrante): Promise<string> {
  const ticket = await bloquearTicket(manager, ticketId);
  const sistemaId = await obtenerUsuarioSistemaId(manager);
  const mensajeId = randomUUID();

  await manager.save(
    MensajeTicket,
    manager.create(MensajeTicket, {
      id: mensajeId,
      ticketId,
      tipo: TipoMensajeTicket.CLIENTE,
      autorId: null,
      autorExterno: correo.de.email,
      cuerpo: correo.texto,
      cuerpoHtml: correo.html ? sanitizeHtml(correo.html) : null,
      messageId: correo.messageId,
      inReplyTo: correo.inReplyTo,
      referencias: correo.referencias.length > 0 ? correo.referencias : null,
    }),
  );

  // Reabre esperando_cliente/resuelto -> abierto y cierra la pausa de SLA activa (cerrado no se
  // reabre); función compartida con el portal (Fase 5), ver ticket.common.ts.
  await reabrirTicketSiCorresponde(manager, ticket, sistemaId);

  for (const adjunto of correo.adjuntos) {
    await procesarAdjuntoEntrante(manager, EntidadAdjunto.MENSAJE, mensajeId, adjunto, sistemaId, ticketId);
  }

  await registrarEventoTicket(manager, ticketId, sistemaId, { tipo: "mensaje_cliente", mensajeId });
  return ticketId;
}

// ------------------------------------------------------------------ paso e: ticket nuevo

async function crearTicketDesdeCorreo(manager: ManagerTransaccional, correo: CorreoEntrante): Promise<string> {
  const sistemaId = await obtenerUsuarioSistemaId(manager);
  const ticketId = randomUUID();
  const numero = await siguienteFolio(manager, "TK");
  // fechaIngreso = cuándo llegó el correo al buzón (no cuándo el job lo procesó): un reprocesamiento
  // manual horas después de un error no debe "reiniciar" el reloj de SLA del cliente.
  const fechaIngreso = correo.recibidoEn;

  // Fase C: canal/estado ya no son valores de enum; se resuelven por nombre, exactamente los
  // sembrados por la migración (ver migrations/1790500000000-CatalogosTicketFaseC.ts).
  const [canal, estadoInicial, prioridad] = await Promise.all([
    manager.findOneByOrFail(CanalTicket, { nombre: "Correo" }),
    manager.findOneByOrFail(EstadoTicket, { esEstadoInicial: true }),
    // El correo no trae una señal de prioridad: mismo default que el portal público (Fase 5).
    manager.findOneByOrFail(Prioridad, { nombre: "Media" }),
  ]);
  const { slaResolucionVenceEn, slaRespuestaVenceEn } = await calcularVencimientosTicket(manager, prioridad.id, fechaIngreso);

  await manager.save(
    Ticket,
    manager.create(Ticket, {
      id: ticketId,
      numero,
      asunto: recortar(correo.asunto.trim() || "(sin asunto)", 200),
      descripcion: correo.texto || "",
      solicitanteNombre: recortar(correo.de.nombre?.trim() || correo.de.email, 120),
      solicitanteEmail: recortar(correo.de.email, 320),
      solicitanteTelefono: null,
      solicitanteEmpresa: null,
      clienteId: null,
      canalId: canal.id,
      prioridadId: prioridad.id,
      estadoId: estadoInicial.id,
      fechaIngreso,
      recepcionadoPorId: sistemaId,
      responsableActualId: null,
      slaResolucionVenceEn,
      slaRespuestaVenceEn,
    }),
  );

  await registrarEventoTicket(manager, ticketId, sistemaId, {
    tipo: "creado",
    numero,
    canal: canal.nombre,
    recepcionadoPorId: sistemaId,
    clienteId: null,
  });

  // Decisión documentada (el encargo dejaba el criterio abierto, punto 3.f): un ticket NUEVO por
  // correo sí admite los adjuntos de la ingesta, asociados a entidadTipo='ticket' (igual que la
  // creación por portal en la Fase 5) — no hay mensaje_ticket al cual colgarlos porque el cuerpo
  // del correo va directo a `descripcion`, sin generar un primer mensaje (mismo criterio que usa
  // el portal: el hilo empieza vacío).
  for (const adjunto of correo.adjuntos) {
    await procesarAdjuntoEntrante(manager, EntidadAdjunto.TICKET, ticketId, adjunto, sistemaId, ticketId);
  }

  return ticketId;
}

// ------------------------------------------------------------------ pipeline (pasos b-g), compartido por la
// ingesta fresca y el reprocesamiento manual (punto 6): NO duplicar esta función.

async function ejecutarPipeline(manager: ManagerTransaccional, correoIngeridoId: string, correo: CorreoEntrante): Promise<string | null> {
  if (esBucle(correo)) {
    await manager.update(CorreoIngerido, correoIngeridoId, { estado: EstadoCorreoIngerido.IGNORADO, ticketId: null, error: null });
    return null;
  }

  const ticketExistenteId = await resolverTicketExistente(manager, correo);
  const ticketId = ticketExistenteId
    ? await agregarMensajeATicketExistente(manager, ticketExistenteId, correo)
    : await crearTicketDesdeCorreo(manager, correo);

  await manager.update(CorreoIngerido, correoIngeridoId, { estado: EstadoCorreoIngerido.PROCESADO, ticketId, error: null });
  return ticketId;
}

// ------------------------------------------------------------------ paso a + orquestación (mensaje nuevo del buzón)

export type ResultadoIngestaMensaje = "duplicado" | "ignorado" | "procesado" | "error";

// Un mensaje por llamada, EN SU PROPIA transacción (más una transacción previa, corta, solo para
// la idempotencia — ver el criterio de consistencia abajo). Nunca lanza para un error esperado del
// propio correo (lo captura y dijar el correo_ingerido en 'error'); jobs/ingestaCorreoJob.ts puede
// seguir con el resto del lote pase lo que pase aquí.
//
// Criterio de consistencia (punto 3.a/3.h del encargo): el INSERT de correo_ingerido (idempotencia)
// se confirma en SU PROPIA transacción, ANTES de tocar cualquier ticket. Si el pipeline (pasos b-g)
// falla después, la fila ya existe y solo se actualiza a estado='error' (nunca se pierde el
// registro). Si el fallo ocurre ANTES de poder insertar la fila (p. ej. FileStorage.guardar
// lanzando por un problema de disco), no hay ningún registro al cual "dejar constancia": se
// registra en el log (nivel error, con el messageId, nunca el cuerpo) y se re-lanza para que el
// job cuente el mensaje como fallido en ese ciclo — en el siguiente fetchNuevos, si el cursor no
// avanzó lo bastante, el mensaje se reintenta solo (no hay fila de correo_ingerido que lo bloquee).
export async function procesarMensajeEntrante(correo: CorreoEntrante, origen: string): Promise<ResultadoIngestaMensaje> {
  const crudo = serializarCorreoEntrante(correo);
  const rawRef = createHash("sha256").update(crudo).digest("hex");

  let correoIngeridoId: string;
  try {
    await fileStorage.guardar(rawRef, crudo);
    correoIngeridoId = randomUUID();
    await AppDataSource.getRepository(CorreoIngerido).insert({
      id: correoIngeridoId,
      messageId: correo.messageId,
      origen,
      recibidoEn: correo.recibidoEn,
      estado: EstadoCorreoIngerido.PENDIENTE,
      ticketId: null,
      error: null,
      rawRef,
    });
  } catch (err) {
    if (violacionUnica(err)) {
      // Mismo messageId ya insertado antes: ya se procesó (o está en curso), se ignora sin tocar
      // nada más (idempotencia, punto 3.a).
      return "duplicado";
    }
    logger.error({ err, messageId: correo.messageId }, "No se pudo dejar constancia de un correo entrante (antes del paso a)");
    throw err;
  }

  try {
    const ticketId = await enTransaccion(AppDataSource, (m) => ejecutarPipeline(m, correoIngeridoId, correo));
    return ticketId === null ? "ignorado" : "procesado";
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    await AppDataSource.getRepository(CorreoIngerido).update(correoIngeridoId, { estado: EstadoCorreoIngerido.ERROR, error: mensaje });
    logger.error({ err, messageId: correo.messageId, correoIngeridoId }, "Error procesando un correo entrante");
    return "error";
  }
}

// ------------------------------------------------------------------ GET /correos-ingeridos

export interface FiltrosCorreoIngerido {
  estado?: EstadoCorreoIngerido | undefined;
  page: number;
  perPage: number;
}

const toCorreoIngeridoDto = (c: CorreoIngerido) => ({
  id: c.id,
  messageId: c.messageId,
  origen: c.origen,
  recibidoEn: c.recibidoEn,
  estado: c.estado,
  ticketId: c.ticketId,
  error: c.error,
});

export async function listarCorreosIngeridos(filtros: FiltrosCorreoIngerido) {
  const repo = AppDataSource.getRepository(CorreoIngerido);
  const [filas, total] = await repo.findAndCount({
    where: filtros.estado ? { estado: filtros.estado } : {},
    order: { recibidoEn: "DESC" },
    skip: filtros.perPage * (filtros.page - 1),
    take: filtros.perPage,
  });
  return { data: filas.map(toCorreoIngeridoDto), meta: { page: filtros.page, perPage: filtros.perPage, total } };
}

// ------------------------------------------------------------------ POST /correos-ingeridos/:id/reprocesar

export function correoIngeridoNoEncontrado(): AppError {
  return new AppError(404, "CORREO_INGERIDO_NO_ENCONTRADO", "Correo ingerido no encontrado");
}

// Solo si estado='error' (409 si no, punto 6 del encargo). Relee el raw_ref desde FileStorage (sin
// volver a conectarse al buzón), reconstruye CorreoEntrante y corre EL MISMO pipeline (ejecutarPipeline,
// no una copia). Nunca duplica la fila: reutiliza el id existente (UPDATE, no INSERT). Si vuelve a
// fallar, la deja en 'error' de nuevo (200, no 500: la operación de "intentar reprocesar" en sí se
// realizó con éxito, aunque el correo siga sin poder procesarse).
export async function reprocesarCorreoIngerido(id: string) {
  const repo = AppDataSource.getRepository(CorreoIngerido);
  const fila = await repo.findOne({ where: { id } });
  if (!fila) throw correoIngeridoNoEncontrado();
  if (fila.estado !== EstadoCorreoIngerido.ERROR) {
    throw new AppError(409, "CORREO_INGERIDO_NO_REPROCESABLE", "Solo se puede reprocesar un correo en estado 'error'");
  }
  if (!fila.rawRef) {
    throw new AppError(409, "CORREO_INGERIDO_NO_REPROCESABLE", "El correo no tiene contenido guardado para reprocesar");
  }

  const stream = await fileStorage.abrirLectura(fila.rawRef);
  const buffer = await bufferDesdeStream(stream);
  const correo = deserializarCorreoEntrante(buffer);

  try {
    await enTransaccion(AppDataSource, (m) => ejecutarPipeline(m, fila.id, correo));
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    await repo.update(fila.id, { estado: EstadoCorreoIngerido.ERROR, error: mensaje });
    logger.error({ err, correoIngeridoId: fila.id }, "Reprocesamiento de correo entrante falló de nuevo");
  }

  const actualizado = await repo.findOneOrFail({ where: { id: fila.id } });
  return toCorreoIngeridoDto(actualizado);
}
