import { randomUUID } from "node:crypto";
import { In } from "typeorm";
import { AppDataSource } from "../config/dataSource.js";
import { Adjunto } from "../entities/Adjunto.js";
import { Asignacion } from "../entities/Asignacion.js";
import { CanalTicket } from "../entities/CanalTicket.js";
import { Cliente } from "../entities/Cliente.js";
import { EstadoTicket } from "../entities/EstadoTicket.js";
import { Evento } from "../entities/Evento.js";
import { MensajeTicket } from "../entities/MensajeTicket.js";
import { Prioridad } from "../entities/Prioridad.js";
import { TemaAyuda } from "../entities/TemaAyuda.js";
import { Ticket } from "../entities/Ticket.js";
import { EntidadAdjunto, EntidadAsignable, EntidadEvento } from "../entities/enums.js";
import { AppError } from "../errors/AppError.js";
import { exigir, puedeCambiarEstado, puedeEditarTicket } from "../policies/ticket.policy.js";
import { escaparLike } from "./ot.service.js";
import type { FiltrosTicket } from "../validations/ticket.validation.js";
import { registrarEventoTicket } from "./evento.service.js";
import { enTransaccion, siguienteFolio, type ManagerTransaccional } from "./folio.service.js";
import { ahoraDb, type UsuarioActor, type UsuarioRef } from "./ot.common.js";
import { exigirPrioridadActiva } from "./prioridad.service.js";
import { calcularVencimientosTicket } from "./sla.calculo.service.js";
import { abrirPausaSiCorresponde, cerrarPausaYCorrerVencimientos } from "./sla.pausa.service.js";
import { bloquearTicket, contextoTicket, ticketNoEncontrado } from "./ticket.common.js";
import { toAdjuntoDto, type AdjuntoDto } from "./adjunto.dto.js";

const ref = (id: string | null | undefined, nombre: string | null | undefined): UsuarioRef | null =>
  id ? { id: id.toLowerCase(), nombre: nombre ?? "" } : null;

export async function exigirClienteActivoTicket(manager: ManagerTransaccional, clienteId: string): Promise<void> {
  const c = await manager.findOne(Cliente, { where: { id: clienteId } });
  if (!c || !c.activo) throw new AppError(400, "CLIENTE_INVALIDO", "clienteId debe ser un cliente existente y activo");
}

// Fase B1: mismo criterio que exigirClienteActivoTicket (FK opcional validada dentro de la misma
// transacción). Sin conexión a SLA ni a ningún comportamiento automático todavía: solo se valida
// que exista y esté activo antes de guardarlo.
export async function exigirTemaAyudaActivo(manager: ManagerTransaccional, temaAyudaId: string): Promise<void> {
  const t = await manager.findOne(TemaAyuda, { where: { id: temaAyudaId } });
  if (!t || !t.activo) throw new AppError(400, "TEMA_AYUDA_INVALIDO", "temaAyudaId debe ser un tema de ayuda existente y activo");
}

// Fase C: catálogos configurables de canal/prioridad/estado, con el mismo criterio que
// exigirClienteActivoTicket/exigirTemaAyudaActivo (existencia + activo, validado dentro de la
// misma transacción que la escritura).
export async function exigirCanalActivo(manager: ManagerTransaccional, canalId: string): Promise<CanalTicket> {
  const c = await manager.findOne(CanalTicket, { where: { id: canalId } });
  if (!c || !c.activo) throw new AppError(400, "CANAL_INVALIDO", "canalId debe ser un canal existente y activo");
  return c;
}

export async function exigirEstadoTicketActivo(manager: ManagerTransaccional, estadoId: string): Promise<EstadoTicket> {
  const e = await manager.findOne(EstadoTicket, { where: { id: estadoId } });
  if (!e || !e.activo) throw new AppError(400, "ESTADO_TICKET_INVALIDO", "estadoId debe ser un estado existente y activo");
  return e;
}

async function exigirEstadoInicial(manager: ManagerTransaccional): Promise<EstadoTicket> {
  const inicial = await manager.findOneBy(EstadoTicket, { esEstadoInicial: true });
  if (!inicial) throw new Error("No hay ningún estado_ticket marcado como esEstadoInicial=true");
  return inicial;
}

// ------------------------------------------------------------------ filtros / listado

const SELECT_BASE = `
  SELECT t.id, t.numero, t.asunto,
         ct.id AS canal_id, ct.nombre AS canal_nombre,
         p.id AS prioridad_id, p.nombre AS prioridad_nombre,
         e.id AS estado_id, e.nombre AS estado_nombre,
         t.solicitante_nombre, t.fecha_ingreso, t.sla_estado, t.creado_en, t.actualizado_en,
         c.id AS cliente_id, c.nombre AS cliente_nombre,
         r.id AS responsable_id, r.nombre AS responsable_nombre
  FROM ticket t
  JOIN canal_ticket ct ON ct.id = t.canal_id
  JOIN prioridad p ON p.id = t.prioridad_id
  JOIN estado_ticket e ON e.id = t.estado_id
  LEFT JOIN cliente c ON c.id = t.cliente_id
  LEFT JOIN usuario r ON r.id = t.responsable_actual_id`;

interface FilaTicket {
  id: string;
  numero: string;
  asunto: string;
  canal_id: string;
  canal_nombre: string;
  prioridad_id: string;
  prioridad_nombre: string;
  estado_id: string;
  estado_nombre: string;
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
  canal: { id: r.canal_id.toLowerCase(), nombre: r.canal_nombre },
  prioridad: { id: r.prioridad_id.toLowerCase(), nombre: r.prioridad_nombre },
  estado: { id: r.estado_id.toLowerCase(), nombre: r.estado_nombre },
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

  if (f.estadoId) w.push(`t.estado_id = ${p(f.estadoId)}`);
  if (f.prioridadId) w.push(`t.prioridad_id = ${p(f.prioridadId)}`);
  if (f.canalId) w.push(`t.canal_id = ${p(f.canalId)}`);
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

// Fase C: estado/prioridad ya no son un enum fijo con un orden literal (CASE ... WHEN); el orden
// natural de cada catálogo ahora vive en su propia columna `orden` (ver entities/EstadoTicket.ts /
// Prioridad.ts), disponible porque SELECT_BASE ya las une.
const ORDEN_SQL: Record<string, string> = {
  numero: "t.numero",
  asunto: "t.asunto",
  estado: "e.orden",
  prioridad: "p.orden",
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
    relations: { cliente: true, recepcionadoPor: true, responsableActual: true, temaAyuda: true, canal: true, prioridad: true, estado: true },
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
    // Fase B1: dato guardado y devuelto, sin ningún efecto automático (mismo criterio que otros
    // campos de referencia ya expuestos como cliente/responsable).
    temaAyuda: ticket.temaAyuda ? { id: ticket.temaAyuda.id, nombre: ticket.temaAyuda.nombre } : null,
    // Fase C: canal/prioridad/estado eran valores de enum; ahora son catálogos, expuestos igual que
    // cliente/temaAyuda ({id, nombre}) en vez de un string plano.
    canal: { id: ticket.canal.id, nombre: ticket.canal.nombre },
    prioridad: { id: ticket.prioridad.id, nombre: ticket.prioridad.nombre },
    estado: { id: ticket.estado.id, nombre: ticket.estado.nombre },
    fechaIngreso: ticket.fechaIngreso,
    recepcionadoPor: { id: ticket.recepcionadoPor.id, nombre: ticket.recepcionadoPor.nombre },
    responsable: ticket.responsableActual ? { id: ticket.responsableActual.id, nombre: ticket.responsableActual.nombre } : null,
    primeraRespuestaEn: ticket.primeraRespuestaEn,
    resueltoEn: ticket.resueltoEn,
    cerradoEn: ticket.cerradoEn,
    slaEstado: ticket.slaEstado,
    // Fase 4: antes de la primera respuesta, slaEstado refleja slaRespuestaVenceEn; después,
    // slaResolucionVenceEn (ver jobs/slaJob.ts). Se exponen ambos, igual que ot.service.ts expone
    // slaResolucionVenceEn (antes de la Fase 4 estos campos no se calculaban y no se exponían).
    slaResolucionVenceEn: ticket.slaResolucionVenceEn,
    slaRespuestaVenceEn: ticket.slaRespuestaVenceEn,
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
  canalId: string;
  prioridadId: string;
  temaAyudaId?: string | undefined;
}

export async function crearTicket(actor: UsuarioActor, input: CrearTicketInput) {
  const ticketId = randomUUID();
  await enTransaccion(AppDataSource, async (m) => {
    if (input.clienteId) await exigirClienteActivoTicket(m, input.clienteId);
    if (input.temaAyudaId) await exigirTemaAyudaActivo(m, input.temaAyudaId);

    // Alta manual (POST /tickets): solo canales con esManual=true (Portal y Correo quedan
    // reservados a sus propios flujos automáticos — antes una lista blanca de Zod, ahora este flag
    // por fila, ver entities/CanalTicket.ts).
    const canal = await exigirCanalActivo(m, input.canalId);
    if (!canal.esManual) {
      throw new AppError(400, "CANAL_INVALIDO", "canalId debe ser un canal de uso manual (Portal y Correo son de sus propios flujos)");
    }
    await exigirPrioridadActiva(m, input.prioridadId);
    const estadoInicial = await exigirEstadoInicial(m);

    const numero = await siguienteFolio(m, "TK");
    // fechaIngreso explícita (mismo motivo que crearOt en ot.service.ts): los dos vencimientos de
    // SLA de la MISMA fila se calculan a partir de ella, antes del INSERT.
    const fechaIngreso = await ahoraDb(m);
    const { slaResolucionVenceEn, slaRespuestaVenceEn } = await calcularVencimientosTicket(m, input.prioridadId, fechaIngreso);
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
        temaAyudaId: input.temaAyudaId ?? null,
        canalId: input.canalId,
        prioridadId: input.prioridadId,
        estadoId: estadoInicial.id,
        fechaIngreso,
        recepcionadoPorId: actor.id, // siempre el usuario autenticado, nunca el body
        responsableActualId: null, // nace sin responsable (decisión 0.4 del diseño)
        slaResolucionVenceEn,
        slaRespuestaVenceEn,
      }),
    );
    await registrarEventoTicket(m, ticketId, actor.id, {
      tipo: "creado",
      numero,
      canal: canal.nombre,
      recepcionadoPorId: actor.id,
      clienteId: ticket.clienteId,
    });
  });
  return obtenerDetalleTicket(ticketId);
}

export interface ActualizarTicketInput {
  asunto?: string | undefined;
  descripcion?: string | undefined;
  prioridadId?: string | undefined;
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

    let prioridadAnteriorNombre: string | null = null;
    let prioridadNuevaNombre: string | null = null;
    if (cambios.prioridadId !== undefined && cambios.prioridadId !== ticket.prioridadId) {
      const [anterior, nueva] = await Promise.all([
        m.findOneByOrFail(Prioridad, { id: ticket.prioridadId }),
        exigirPrioridadActiva(m, cambios.prioridadId),
      ]);
      prioridadAnteriorNombre = anterior.nombre;
      prioridadNuevaNombre = nueva.nombre;
      ticket.prioridadId = cambios.prioridadId;
      // Recalcula ambos vencimientos desde la fecha_ingreso ORIGINAL (no desde ahora).
      const venc = await calcularVencimientosTicket(m, ticket.prioridadId, ticket.fechaIngreso);
      ticket.slaResolucionVenceEn = venc.slaResolucionVenceEn;
      ticket.slaRespuestaVenceEn = venc.slaRespuestaVenceEn;
    }

    if (editados.length === 0 && prioridadAnteriorNombre === null) return; // nada cambió: sin UPDATE ni evento
    await m.save(Ticket, ticket);

    if (prioridadAnteriorNombre !== null) {
      // Payload legible por nombre (no el uuid), mismo criterio que estado_cambiado: el registro de
      // auditoría queda autocontenido aunque la prioridad se renombre o se desactive más adelante.
      await registrarEventoTicket(m, id, actor.id, { tipo: "prioridad_cambiada", de: prioridadAnteriorNombre, a: prioridadNuevaNombre! });
    }
    if (editados.length > 0) await registrarEventoTicket(m, id, actor.id, { tipo: "ticket_editado", campos: editados });
  });
  return obtenerDetalleTicket(id);
}

export async function cambiarEstadoTicket(actor: UsuarioActor, id: string, nuevoId: string) {
  await enTransaccion(AppDataSource, async (m) => {
    const ticket = await bloquearTicket(m, id);
    exigir(puedeCambiarEstado(contextoTicket(ticket, actor)));
    if (ticket.estadoId === nuevoId) throw new AppError(409, "ESTADO_SIN_CAMBIO", `El ticket ya está en ese estado`);

    const anteriorId = ticket.estadoId;
    const [anterior, nuevo] = await Promise.all([
      m.findOneByOrFail(EstadoTicket, { id: anteriorId }),
      exigirEstadoTicketActivo(m, nuevoId),
    ]);

    ticket.estadoId = nuevoId;
    const ahora = await ahoraDb(m);
    // Se fijan una sola vez: retroceder de estado más adelante no los borra.
    if (nuevo.marcaResueltoEn && ticket.resueltoEn === null) ticket.resueltoEn = ahora;
    if (nuevo.marcaCerradoEn && ticket.cerradoEn === null) ticket.cerradoEn = ahora;

    // Pausa del SLA (Fase 4, solo tickets): al entrar a un estado con esPausaSla se abre (si la
    // prioridad lo tiene configurado); al salir de uno se cierra y se corren los vencimientos por
    // lo que duró.
    if (nuevo.esPausaSla) {
      await abrirPausaSiCorresponde(m, ticket, ahora);
    } else if (anterior.esPausaSla) {
      await cerrarPausaYCorrerVencimientos(m, ticket, ahora);
    }

    await m.save(Ticket, ticket);
    await registrarEventoTicket(m, id, actor.id, { tipo: "estado_cambiado", de: anterior.nombre, a: nuevo.nombre });
  });
  return obtenerDetalleTicket(id);
}
