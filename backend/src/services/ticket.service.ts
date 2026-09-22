import { randomUUID } from "node:crypto";
import { In } from "typeorm";
import { AppDataSource } from "../config/dataSource.js";
import { Adjunto } from "../entities/Adjunto.js";
import { Asignacion } from "../entities/Asignacion.js";
import { Cliente } from "../entities/Cliente.js";
import { Evento } from "../entities/Evento.js";
import { MensajeTicket } from "../entities/MensajeTicket.js";
import { Ticket } from "../entities/Ticket.js";
import { CanalTicket, EntidadAdjunto, EntidadAsignable, EntidadEvento, EstadoTicket, type Prioridad } from "../entities/enums.js";
import { AppError } from "../errors/AppError.js";
import { exigir, puedeCambiarEstado, puedeEditarTicket } from "../policies/ticket.policy.js";
import { escaparLike } from "./ot.service.js";
import type { FiltrosTicket } from "../validations/ticket.validation.js";
import { registrarEventoTicket } from "./evento.service.js";
import { enTransaccion, siguienteFolio, type ManagerTransaccional } from "./folio.service.js";
import { ahoraDb, type UsuarioActor, type UsuarioRef } from "./ot.common.js";
import { bloquearTicket, contextoTicket, ticketNoEncontrado } from "./ticket.common.js";
import { toAdjuntoDto, type AdjuntoDto } from "./adjunto.dto.js";

const ref = (id: string | null | undefined, nombre: string | null | undefined): UsuarioRef | null =>
  id ? { id: id.toLowerCase(), nombre: nombre ?? "" } : null;

export async function exigirClienteActivoTicket(manager: ManagerTransaccional, clienteId: string): Promise<void> {
  const c = await manager.findOne(Cliente, { where: { id: clienteId } });
  if (!c || !c.activo) throw new AppError(400, "CLIENTE_INVALIDO", "clienteId debe ser un cliente existente y activo");
}

// ------------------------------------------------------------------ filtros / listado

const SELECT_BASE = `
  SELECT t.id, t.numero, t.asunto, t.canal, t.prioridad, t.estado, t.solicitante_nombre,
         t.fecha_ingreso, t.sla_estado, t.creado_en, t.actualizado_en,
         c.id AS cliente_id, c.nombre AS cliente_nombre,
         r.id AS responsable_id, r.nombre AS responsable_nombre
  FROM ticket t
  LEFT JOIN cliente c ON c.id = t.cliente_id
  LEFT JOIN usuario r ON r.id = t.responsable_actual_id`;

interface FilaTicket {
  id: string;
  numero: string;
  asunto: string;
  canal: string;
  prioridad: string;
  estado: string;
  solicitante_nombre: string;
  fecha_ingreso: Date;
  sla_estado: string;
  cliente_id: string | null;
  cliente_nombre: string | null;
  responsable_id: string | null;
  responsable_nombre: string | null;
}

const filaToListDto = (r: FilaTicket) => ({
  id: r.id.toLowerCase(),
  numero: r.numero,
  asunto: r.asunto,
  canal: r.canal,
  prioridad: r.prioridad,
  estado: r.estado,
  cliente: ref(r.cliente_id, r.cliente_nombre),
  solicitanteNombre: r.solicitante_nombre,
  responsable: ref(r.responsable_id, r.responsable_nombre),
  fechaIngreso: r.fecha_ingreso,
  slaEstado: r.sla_estado,
});

function construirFiltros(f: FiltrosTicket, usuarioId: string): { where: string; params: unknown[] } {
  const params: unknown[] = [];
  const p = (v: unknown) => `@${params.push(v) - 1}`;
  const w: string[] = [];

  if (f.estado) w.push(`t.estado = ${p(f.estado)}`);
  if (f.prioridad) w.push(`t.prioridad = ${p(f.prioridad)}`);
  if (f.canal) w.push(`t.canal = ${p(f.canal)}`);
  if (f.responsable) w.push(`t.responsable_actual_id = ${p(f.responsable)}`);
  if (f.mios) w.push(`t.responsable_actual_id = ${p(usuarioId)}`);
  if (f.sinAsignar) w.push(`t.responsable_actual_id IS NULL`);
  if (f.q) {
    const like = p(`%${escaparLike(f.q)}%`);
    w.push(`(t.numero LIKE ${like} ESCAPE '\\' OR t.asunto LIKE ${like} ESCAPE '\\' OR t.solicitante_nombre LIKE ${like} ESCAPE '\\')`);
  }
  const dia = "CAST(t.fecha_ingreso AT TIME ZONE 'Pacific SA Standard Time' AS date)";
  if (f.desde) w.push(`${dia} >= ${p(f.desde)}`);
  if (f.hasta) w.push(`${dia} <= ${p(f.hasta)}`);

  return { where: w.length ? `WHERE ${w.join(" AND ")}` : "", params };
}

const ORDEN_SQL: Record<string, string> = {
  numero: "t.numero",
  asunto: "t.asunto",
  estado: "CASE t.estado WHEN 'nuevo' THEN 1 WHEN 'abierto' THEN 2 WHEN 'esperando_cliente' THEN 3 WHEN 'resuelto' THEN 4 ELSE 5 END",
  prioridad: "CASE t.prioridad WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END",
  fechaIngreso: "t.fecha_ingreso",
  creadoEn: "t.creado_en",
  actualizadoEn: "t.actualizado_en",
};

export async function listarTickets(
  filtros: FiltrosTicket & { page: number; perPage: number; orden: string; dir: "asc" | "desc" },
  usuarioId: string,
) {
  const { where, params } = construirFiltros(filtros, usuarioId);
  const expr = ORDEN_SQL[filtros.orden];
  if (!expr) throw new AppError(400, "VALIDATION_ERROR", "Columna de orden no permitida");
  const dir = filtros.dir === "asc" ? "ASC" : "DESC";

  const [{ total }] = (await AppDataSource.query(`SELECT COUNT(*) AS total FROM ticket t ${where}`, params)) as Array<{ total: number }>;
  const filas: FilaTicket[] = await AppDataSource.query(
    `${SELECT_BASE} ${where}
     ORDER BY ${expr} ${dir}${filtros.orden === "numero" ? "" : `, t.numero ${dir}`}
     OFFSET ${filtros.perPage * (filtros.page - 1)} ROWS FETCH NEXT ${filtros.perPage} ROWS ONLY`,
    params,
  );

  return { data: filas.map(filaToListDto), meta: { page: filtros.page, perPage: filtros.perPage, total } };
}

// ------------------------------------------------------------------ detalle

export const toMensajeDto = (m: MensajeTicket, adjuntos: AdjuntoDto[]) => ({
  id: m.id,
  tipo: m.tipo,
  autor: m.autor ? { id: m.autor.id, nombre: m.autor.nombre } : null,
  autorExterno: m.autorExterno,
  cuerpo: m.cuerpo,
  adjuntos,
  creadoEn: m.creadoEn,
});

export async function obtenerDetalleTicket(id: string) {
  const ticket = await AppDataSource.getRepository(Ticket).findOne({
    where: { id },
    relations: { cliente: true, recepcionadoPor: true, responsableActual: true },
  });
  if (!ticket) throw ticketNoEncontrado();

  const [tramos, mensajes, adjuntosTicket, eventos, otsVinculadas] = await Promise.all([
    AppDataSource.getRepository(Asignacion).find({
      where: { entidadTipo: EntidadAsignable.TICKET, entidadId: id },
      relations: { usuario: true, derivadoPor: true },
      order: { desde: "ASC" },
    }),
    AppDataSource.getRepository(MensajeTicket).find({ where: { ticketId: id }, relations: { autor: true }, order: { creadoEn: "ASC" } }),
    AppDataSource.getRepository(Adjunto).find({
      where: { entidadTipo: EntidadAdjunto.TICKET, entidadId: id },
      relations: { subidoPor: true },
      order: { creadoEn: "ASC" },
    }),
    AppDataSource.getRepository(Evento).find({
      where: { entidadTipo: EntidadEvento.TICKET, entidadId: id },
      relations: { actor: true },
      order: { ocurridoEn: "DESC", id: "DESC" },
    }),
    AppDataSource.query(
      `SELECT tv.ot_id, tv.es_origen, o.numero, o.titulo, o.estado
       FROM ticket_ot tv JOIN ot o ON o.id = tv.ot_id
       WHERE tv.ticket_id = @0 ORDER BY tv.es_origen DESC, tv.creado_en ASC`,
      [id],
    ) as Promise<Array<{ ot_id: string; es_origen: boolean; numero: string; titulo: string; estado: string }>>,
  ]);

  const adjuntosPorMensaje = mensajes.length
    ? await AppDataSource.getRepository(Adjunto).find({
        where: { entidadTipo: EntidadAdjunto.MENSAJE, entidadId: In(mensajes.map((m) => m.id)) },
        relations: { subidoPor: true },
        order: { creadoEn: "ASC" },
      })
    : [];
  const adjuntosPorMensajeMapa = new Map<string, AdjuntoDto[]>();
  for (const a of adjuntosPorMensaje) {
    const k = a.entidadId.toLowerCase();
    const lista = adjuntosPorMensajeMapa.get(k) ?? [];
    lista.push(toAdjuntoDto(a));
    adjuntosPorMensajeMapa.set(k, lista);
  }

  const ahora = Date.now();
  return {
    id: ticket.id,
    numero: ticket.numero,
    asunto: ticket.asunto,
    descripcion: ticket.descripcion,
    solicitanteNombre: ticket.solicitanteNombre,
    solicitanteEmail: ticket.solicitanteEmail,
    solicitanteTelefono: ticket.solicitanteTelefono,
    solicitanteEmpresa: ticket.solicitanteEmpresa,
    cliente: ticket.cliente ? { id: ticket.cliente.id, nombre: ticket.cliente.nombre } : null,
    canal: ticket.canal,
    prioridad: ticket.prioridad,
    estado: ticket.estado,
    fechaIngreso: ticket.fechaIngreso,
    recepcionadoPor: { id: ticket.recepcionadoPor.id, nombre: ticket.recepcionadoPor.nombre },
    responsable: ticket.responsableActual ? { id: ticket.responsableActual.id, nombre: ticket.responsableActual.nombre } : null,
    primeraRespuestaEn: ticket.primeraRespuestaEn,
    resueltoEn: ticket.resueltoEn,
    cerradoEn: ticket.cerradoEn,
    slaEstado: ticket.slaEstado,
    creadoEn: ticket.creadoEn,
    actualizadoEn: ticket.actualizadoEn,
    cadenaResponsables: tramos.map((t) => ({
      id: t.id,
      usuario: { id: t.usuario.id, nombre: t.usuario.nombre },
      desde: t.desde,
      hasta: t.hasta,
      duracionSeg: t.hasta ? (t.duracionSeg ?? 0) : Math.max(0, Math.floor((ahora - t.desde.getTime()) / 1000)),
      actual: t.hasta === null,
      motivoEntrada: t.motivoEntrada,
      derivadoPor: t.derivadoPor ? { id: t.derivadoPor.id, nombre: t.derivadoPor.nombre } : null,
    })),
    mensajes: mensajes.map((m) => toMensajeDto(m, adjuntosPorMensajeMapa.get(m.id.toLowerCase()) ?? [])),
    adjuntos: adjuntosTicket.map(toAdjuntoDto),
    ots: otsVinculadas.map((r) => ({
      id: r.ot_id.toLowerCase(),
      numero: r.numero,
      titulo: r.titulo,
      estado: r.estado,
      esOrigen: !!r.es_origen,
    })),
    eventos: eventos.map((e) => ({
      id: e.id,
      tipo: e.tipo,
      actor: e.actor ? { id: e.actor.id, nombre: e.actor.nombre } : null,
      payload: e.payload,
      ocurridoEn: e.ocurridoEn,
    })),
  };
}

export async function listarEventosTicket(ticketId: string) {
  if (!(await AppDataSource.getRepository(Ticket).exists({ where: { id: ticketId } }))) throw ticketNoEncontrado();
  const eventos = await AppDataSource.getRepository(Evento).find({
    where: { entidadTipo: EntidadEvento.TICKET, entidadId: ticketId },
    relations: { actor: true },
    order: { ocurridoEn: "DESC", id: "DESC" },
  });
  return eventos.map((e) => ({
    id: e.id,
    tipo: e.tipo,
    actor: e.actor ? { id: e.actor.id, nombre: e.actor.nombre } : null,
    payload: e.payload,
    ocurridoEn: e.ocurridoEn,
  }));
}

// ------------------------------------------------------------------ escritura

export interface CrearTicketInput {
  asunto: string;
  descripcion: string;
  solicitanteNombre: string;
  solicitanteEmail: string;
  solicitanteTelefono?: string | undefined;
  solicitanteEmpresa?: string | undefined;
  clienteId?: string | undefined;
  canal: "telefono" | "presencial" | "interno";
  prioridad: Prioridad;
}

export async function crearTicket(actor: UsuarioActor, input: CrearTicketInput) {
  const ticketId = randomUUID();
  await enTransaccion(AppDataSource, async (m) => {
    if (input.clienteId) await exigirClienteActivoTicket(m, input.clienteId);

    const numero = await siguienteFolio(m, "TK");
    const ticket = await m.save(
      Ticket,
      m.create(Ticket, {
        id: ticketId,
        numero,
        asunto: input.asunto,
        descripcion: input.descripcion,
        solicitanteNombre: input.solicitanteNombre,
        solicitanteEmail: input.solicitanteEmail,
        solicitanteTelefono: input.solicitanteTelefono ?? null,
        solicitanteEmpresa: input.solicitanteEmpresa ?? null,
        clienteId: input.clienteId ?? null,
        canal: input.canal as CanalTicket,
        prioridad: input.prioridad,
        estado: EstadoTicket.NUEVO,
        recepcionadoPorId: actor.id, // siempre el usuario autenticado, nunca el body
        responsableActualId: null, // nace sin responsable (decisión 0.4 del diseño)
      }),
    );
    await registrarEventoTicket(m, ticketId, actor.id, {
      tipo: "creado",
      numero,
      canal: input.canal,
      recepcionadoPorId: actor.id,
      clienteId: ticket.clienteId,
    });
  });
  return obtenerDetalleTicket(ticketId);
}

export interface ActualizarTicketInput {
  asunto?: string | undefined;
  descripcion?: string | undefined;
  prioridad?: Prioridad | undefined;
}

export async function actualizarTicket(actor: UsuarioActor, id: string, cambios: ActualizarTicketInput) {
  await enTransaccion(AppDataSource, async (m) => {
    const ticket = await bloquearTicket(m, id);
    exigir(puedeEditarTicket(contextoTicket(ticket, actor)));

    const editados: string[] = [];
    if (cambios.asunto !== undefined && cambios.asunto !== ticket.asunto) {
      ticket.asunto = cambios.asunto;
      editados.push("asunto");
    }
    if (cambios.descripcion !== undefined && cambios.descripcion !== ticket.descripcion) {
      ticket.descripcion = cambios.descripcion;
      editados.push("descripcion");
    }

    let prioridadAnterior: Prioridad | null = null;
    if (cambios.prioridad !== undefined && cambios.prioridad !== ticket.prioridad) {
      prioridadAnterior = ticket.prioridad;
      ticket.prioridad = cambios.prioridad;
    }

    if (editados.length === 0 && prioridadAnterior === null) return; // nada cambió: sin UPDATE ni evento
    await m.save(Ticket, ticket);

    if (prioridadAnterior !== null) {
      await registrarEventoTicket(m, id, actor.id, { tipo: "prioridad_cambiada", de: prioridadAnterior, a: ticket.prioridad });
    }
    if (editados.length > 0) await registrarEventoTicket(m, id, actor.id, { tipo: "ticket_editado", campos: editados });
  });
  return obtenerDetalleTicket(id);
}

export async function cambiarEstadoTicket(actor: UsuarioActor, id: string, nuevo: EstadoTicket) {
  await enTransaccion(AppDataSource, async (m) => {
    const ticket = await bloquearTicket(m, id);
    exigir(puedeCambiarEstado(contextoTicket(ticket, actor)));
    if (ticket.estado === nuevo) throw new AppError(409, "ESTADO_SIN_CAMBIO", `El ticket ya está en estado ${nuevo}`);

    const anterior = ticket.estado;
    ticket.estado = nuevo;
    const ahora = await ahoraDb(m);
    // Se fijan una sola vez: retroceder de estado más adelante no los borra.
    if (nuevo === EstadoTicket.RESUELTO && ticket.resueltoEn === null) ticket.resueltoEn = ahora;
    if (nuevo === EstadoTicket.CERRADO && ticket.cerradoEn === null) ticket.cerradoEn = ahora;
    await m.save(Ticket, ticket);
    await registrarEventoTicket(m, id, actor.id, { tipo: "estado_cambiado", de: anterior, a: nuevo });
  });
  return obtenerDetalleTicket(id);
}
