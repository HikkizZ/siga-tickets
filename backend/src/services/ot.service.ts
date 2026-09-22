import { randomUUID } from "node:crypto";
import { AppDataSource } from "../config/dataSource.js";
import { Adjunto } from "../entities/Adjunto.js";
import { Asignacion } from "../entities/Asignacion.js";
import { Cliente } from "../entities/Cliente.js";
import { ComentarioOt } from "../entities/ComentarioOt.js";
import { EtapaOt } from "../entities/EtapaOt.js";
import { Evento } from "../entities/Evento.js";
import { HoraTrabajada } from "../entities/HoraTrabajada.js";
import { Ot } from "../entities/Ot.js";
import { OtColaborador } from "../entities/OtColaborador.js";
import { EntidadAdjunto, EntidadAsignable, EntidadEvento, EstadoOt, type Prioridad } from "../entities/enums.js";
import { AppError } from "../errors/AppError.js";
import { exigir, puedeCambiarEstado, puedeEditarOt } from "../policies/ot.policy.js";
import type { FiltrosOt } from "../validations/ot.validation.js";
import { registrarEventoOt } from "./evento.service.js";
import { enTransaccion, siguienteFolio, type ManagerTransaccional } from "./folio.service.js";
import { ahoraDb, bloquearOt, contextoOt, otNoEncontrada, usuarioAsignable, type UsuarioActor, type UsuarioRef } from "./ot.common.js";
import { toAdjuntoDto } from "./adjunto.dto.js";

const ESTADOS_ORDEN: EstadoOt[] = [
  EstadoOt.INGRESADO,
  EstadoOt.EN_COTIZACION,
  EstadoOt.APROBADO,
  EstadoOt.EN_EJECUCION,
  EstadoOt.TERMINADO,
  EstadoOt.FACTURADO,
];

const ref = (id: string | null | undefined, nombre: string | null | undefined): UsuarioRef | null =>
  id ? { id: id.toLowerCase(), nombre: nombre ?? "" } : null;

// ------------------------------------------------------------------ filtros (listado y kanban)

// Escapa los comodines de LIKE con ESCAPE '\' para que el término se busque literal.
export function escaparLike(termino: string): string {
  return termino.replace(/[\\%_[]/g, (c) => `\\${c}`);
}

function construirFiltros(f: FiltrosOt, usuarioId: string): { where: string; params: unknown[] } {
  const params: unknown[] = [];
  const p = (v: unknown) => `@${params.push(v) - 1}`;
  const w: string[] = [];

  if (f.estado) w.push(`o.estado = ${p(f.estado)}`);
  if (f.prioridad) w.push(`o.prioridad = ${p(f.prioridad)}`);
  if (f.categoria) w.push(`o.categoria = ${p(f.categoria)}`);
  if (f.clienteId) w.push(`o.cliente_id = ${p(f.clienteId)}`);
  if (f.responsableId) w.push(`o.responsable_actual_id = ${p(f.responsableId)}`);
  if (f.mios) {
    const u = p(usuarioId);
    w.push(`(o.responsable_actual_id = ${u} OR EXISTS (SELECT 1 FROM ot_colaborador oc WHERE oc.ot_id = o.id AND oc.usuario_id = ${u}))`);
  }
  if (f.q) {
    const like = p(`%${escaparLike(f.q)}%`);
    w.push(`(o.numero LIKE ${like} ESCAPE '\\' OR o.titulo LIKE ${like} ESCAPE '\\' OR o.solicitante_nombre LIKE ${like} ESCAPE '\\')`);
  }
  // Los días se cuentan en hora de Chile (el instante se guarda en UTC).
  const dia = "CAST(o.fecha_ingreso AT TIME ZONE 'Pacific SA Standard Time' AS date)";
  if (f.desde) w.push(`${dia} >= ${p(f.desde)}`);
  if (f.hasta) w.push(`${dia} <= ${p(f.hasta)}`);

  return { where: w.length ? `WHERE ${w.join(" AND ")}` : "", params };
}

const SELECT_BASE = `
  SELECT o.id, o.numero, o.titulo, o.es_interna, o.area_interna, o.categoria, o.prioridad, o.origen, o.estado,
         o.solicitante_nombre, o.fecha_ingreso, o.sla_estado, o.creado_en, o.actualizado_en,
         CONVERT(varchar(10), o.fecha_estimada_termino, 23) AS fecha_estimada_termino,
         c.id AS cliente_id, c.nombre AS cliente_nombre,
         r.id AS responsable_id, r.nombre AS responsable_nombre
  FROM ot o
  LEFT JOIN cliente c ON c.id = o.cliente_id
  LEFT JOIN usuario r ON r.id = o.responsable_actual_id`;

interface FilaOt {
  id: string;
  numero: string;
  titulo: string;
  es_interna: boolean;
  area_interna: string | null;
  categoria: string;
  prioridad: string;
  origen: string;
  estado: string;
  solicitante_nombre: string | null;
  fecha_ingreso: Date;
  sla_estado: string;
  fecha_estimada_termino: string | null;
  cliente_id: string | null;
  cliente_nombre: string | null;
  responsable_id: string | null;
  responsable_nombre: string | null;
}

const baseDto = (r: FilaOt) => ({
  id: r.id.toLowerCase(),
  numero: r.numero,
  titulo: r.titulo,
  cliente: ref(r.cliente_id, r.cliente_nombre),
  areaInterna: r.area_interna,
  prioridad: r.prioridad,
  responsable: ref(r.responsable_id, r.responsable_nombre),
  fechaEstimadaTermino: r.fecha_estimada_termino,
  slaEstado: r.sla_estado,
});

// Lista blanca de orden: el nombre llega del cliente, jamás se interpola tal cual.
const ORDEN_SQL: Record<string, string> = {
  numero: "o.numero",
  titulo: "o.titulo",
  estado: "CASE o.estado WHEN 'ingresado' THEN 1 WHEN 'en_cotizacion' THEN 2 WHEN 'aprobado' THEN 3 WHEN 'en_ejecucion' THEN 4 WHEN 'terminado' THEN 5 ELSE 6 END",
  prioridad: "CASE o.prioridad WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END",
  fechaIngreso: "o.fecha_ingreso",
  fechaEstimadaTermino: "o.fecha_estimada_termino",
  creadoEn: "o.creado_en",
  actualizadoEn: "o.actualizado_en",
};

export async function listarOts(
  filtros: FiltrosOt & { page: number; perPage: number; orden: string; dir: "asc" | "desc" },
  usuarioId: string,
) {
  const { where, params } = construirFiltros(filtros, usuarioId);
  const expr = ORDEN_SQL[filtros.orden];
  if (!expr) throw new AppError(400, "VALIDATION_ERROR", "Columna de orden no permitida");
  const dir = filtros.dir === "asc" ? "ASC" : "DESC";

  const [{ total }] = (await AppDataSource.query(`SELECT COUNT(*) AS total FROM ot o ${where}`, params)) as Array<{ total: number }>;
  // page/perPage son enteros ya validados por Zod.
  const filas: FilaOt[] = await AppDataSource.query(
    `${SELECT_BASE} ${where}
     ORDER BY ${expr} ${dir}${filtros.orden === "numero" ? "" : `, o.numero ${dir}`}
     OFFSET ${filtros.perPage * (filtros.page - 1)} ROWS FETCH NEXT ${filtros.perPage} ROWS ONLY`,
    params,
  );

  return {
    data: filas.map((r) => ({
      ...baseDto(r),
      esInterna: !!r.es_interna,
      categoria: r.categoria,
      origen: r.origen,
      estado: r.estado,
      solicitanteNombre: r.solicitante_nombre,
      fechaIngreso: r.fecha_ingreso,
    })),
    meta: { page: filtros.page, perPage: filtros.perPage, total },
  };
}

// Kanban: 3 consultas fijas (OT, colaboradores, adjuntos) sea cual sea la cantidad de OT: sin N+1.
export async function kanbanOts(filtros: FiltrosOt, usuarioId: string) {
  const { where, params } = construirFiltros(filtros, usuarioId);
  const subOts = `SELECT o.id FROM ot o ${where}`;

  const [filas, colabs, adjs] = await Promise.all([
    AppDataSource.query(`${SELECT_BASE} ${where} ORDER BY o.fecha_ingreso DESC, o.numero DESC`, params) as Promise<FilaOt[]>,
    AppDataSource.query(
      `SELECT oc.ot_id, u.id, u.nombre FROM ot_colaborador oc JOIN usuario u ON u.id = oc.usuario_id
       WHERE oc.ot_id IN (${subOts}) ORDER BY oc.creado_en, u.nombre`,
      params,
    ) as Promise<Array<{ ot_id: string; id: string; nombre: string }>>,
    AppDataSource.query(
      `SELECT entidad_id, COUNT(*) AS n FROM adjunto
       WHERE entidad_tipo = 'ot' AND entidad_id IN (${subOts}) GROUP BY entidad_id`,
      params,
    ) as Promise<Array<{ entidad_id: string; n: number }>>,
  ]);

  const colabsPorOt = new Map<string, UsuarioRef[]>();
  for (const c of colabs) {
    const k = c.ot_id.toLowerCase();
    const lista = colabsPorOt.get(k) ?? [];
    lista.push({ id: c.id.toLowerCase(), nombre: c.nombre });
    colabsPorOt.set(k, lista);
  }
  const adjPorOt = new Map(adjs.map((a) => [a.entidad_id.toLowerCase(), a.n]));

  return ESTADOS_ORDEN.map((estado) => {
    const ots = filas
      .filter((r) => r.estado === estado)
      .map((r) => {
        const todos = colabsPorOt.get(r.id.toLowerCase()) ?? [];
        return {
          ...baseDto(r),
          colaboradores: { items: todos.slice(0, 3), total: todos.length },
          adjuntosCount: adjPorOt.get(r.id.toLowerCase()) ?? 0,
        };
      });
    return { estado, total: ots.length, ots };
  });
}

// ------------------------------------------------------------------ detalle

// Suma en centésimas para no acumular error de coma flotante.
export function sumarHoras(valores: number[]): number {
  return valores.reduce((acc, h) => acc + Math.round(h * 100), 0) / 100;
}

export const toEtapaDto = (e: EtapaOt) => ({
  id: e.id,
  nombre: e.nombre,
  fechaInicio: e.fechaInicio,
  fechaTermino: e.fechaTermino,
  orden: e.orden,
});

export const toHoraDto = (h: HoraTrabajada) => ({
  id: h.id,
  usuario: { id: h.usuario.id, nombre: h.usuario.nombre },
  fecha: h.fecha,
  horas: h.horas,
  detalle: h.detalle,
  creadoEn: h.creadoEn,
});

export const toComentarioDto = (c: ComentarioOt) => ({
  id: c.id,
  autor: { id: c.autor.id, nombre: c.autor.nombre },
  cuerpo: c.cuerpo,
  visibleCliente: c.visibleCliente,
  creadoEn: c.creadoEn,
});

interface FilaCotizacionOt {
  id: string;
  numero: string;
  monto_clp: string;
  fecha: string;
  estado: string;
  version: number;
  es_principal: boolean;
}

export async function obtenerDetalleOt(id: string) {
  const ot = await AppDataSource.getRepository(Ot).findOne({
    where: { id },
    relations: { cliente: true, recepcionadoPor: true, responsableActual: true },
  });
  if (!ot) throw otNoEncontrada();

  const [colabs, tramos, etapas, horas, comentarios, adjuntos, eventos, cotizaciones, ticketsVinculados] = await Promise.all([
    AppDataSource.getRepository(OtColaborador).find({ where: { otId: id }, relations: { usuario: true }, order: { creadoEn: "ASC" } }),
    AppDataSource.getRepository(Asignacion).find({
      where: { entidadTipo: EntidadAsignable.OT, entidadId: id },
      relations: { usuario: true, derivadoPor: true },
      order: { desde: "ASC" },
    }),
    AppDataSource.getRepository(EtapaOt).find({ where: { otId: id }, order: { orden: "ASC", fechaInicio: "ASC" } }),
    AppDataSource.getRepository(HoraTrabajada).find({ where: { otId: id }, relations: { usuario: true }, order: { fecha: "DESC", creadoEn: "DESC" } }),
    AppDataSource.getRepository(ComentarioOt).find({ where: { otId: id }, relations: { autor: true }, order: { creadoEn: "DESC" } }),
    AppDataSource.getRepository(Adjunto).find({
      where: { entidadTipo: EntidadAdjunto.OT, entidadId: id },
      relations: { subidoPor: true },
      order: { creadoEn: "ASC" },
    }),
    AppDataSource.getRepository(Evento).find({
      where: { entidadTipo: EntidadEvento.OT, entidadId: id },
      relations: { actor: true },
      order: { ocurridoEn: "DESC", id: "DESC" },
    }),
    // Consulta cruda (no el repositorio de Cotizacion) para evitar un import circular con
    // cotizacion.service.ts, que ya importa de este módulo (escaparLike, obtenerDetalleOt).
    AppDataSource.query(
      `SELECT id, numero, monto_clp, CONVERT(varchar(10), fecha, 23) AS fecha, estado, version, es_principal
       FROM cotizacion WHERE ot_id = @0 ORDER BY version DESC`,
      [id],
    ) as Promise<FilaCotizacionOt[]>,
    // Fase 3: tickets vinculados vía ticket_ot, el de origen primero (antes este campo era []).
    AppDataSource.query(
      `SELECT t.id, t.numero, t.asunto, t.estado, t.canal, tv.es_origen
       FROM ticket_ot tv JOIN ticket t ON t.id = tv.ticket_id
       WHERE tv.ot_id = @0 ORDER BY tv.es_origen DESC, tv.creado_en ASC`,
      [id],
    ) as Promise<Array<{ id: string; numero: string; asunto: string; estado: string; canal: string; es_origen: boolean }>>,
  ]);

  const ahora = Date.now();
  return {
    id: ot.id,
    numero: ot.numero,
    titulo: ot.titulo,
    descripcion: ot.descripcion,
    estado: ot.estado,
    prioridad: ot.prioridad,
    categoria: ot.categoria,
    origen: ot.origen,
    esInterna: ot.esInterna,
    cliente: ot.cliente ? { id: ot.cliente.id, nombre: ot.cliente.nombre } : null,
    areaInterna: ot.areaInterna,
    ubicacion: ot.ubicacion,
    solicitanteNombre: ot.solicitanteNombre,
    solicitanteContacto: ot.solicitanteContacto,
    fechaIngreso: ot.fechaIngreso,
    fechaEstimadaTermino: ot.fechaEstimadaTermino,
    terminadoEn: ot.terminadoEn,
    slaEstado: ot.slaEstado,
    slaResolucionVenceEn: ot.slaResolucionVenceEn,
    creadoEn: ot.creadoEn,
    actualizadoEn: ot.actualizadoEn,
    recepcionadoPor: { id: ot.recepcionadoPor.id, nombre: ot.recepcionadoPor.nombre },
    responsable: ot.responsableActual ? { id: ot.responsableActual.id, nombre: ot.responsableActual.nombre } : null,
    colaboradores: colabs.map((c) => ({ id: c.usuario.id, nombre: c.usuario.nombre })),
    cadenaResponsables: tramos.map((t) => ({
      id: t.id,
      usuario: { id: t.usuario.id, nombre: t.usuario.nombre },
      desde: t.desde,
      hasta: t.hasta,
      // La columna calculada es NULL con el tramo abierto: ahí se informa lo transcurrido hasta ahora.
      duracionSeg: t.hasta ? (t.duracionSeg ?? 0) : Math.max(0, Math.floor((ahora - t.desde.getTime()) / 1000)),
      actual: t.hasta === null,
      motivoEntrada: t.motivoEntrada,
      derivadoPor: t.derivadoPor ? { id: t.derivadoPor.id, nombre: t.derivadoPor.nombre } : null,
    })),
    etapas: etapas.map(toEtapaDto),
    horas: { total: sumarHoras(horas.map((h) => h.horas)), items: horas.map(toHoraDto) },
    comentarios: comentarios.map(toComentarioDto),
    adjuntos: adjuntos.map(toAdjuntoDto),
    eventos: eventos.map((e) => ({
      id: e.id,
      tipo: e.tipo,
      actor: e.actor ? { id: e.actor.id, nombre: e.actor.nombre } : null,
      payload: e.payload,
      ocurridoEn: e.ocurridoEn,
    })),
    cotizaciones: cotizaciones.map((c) => ({
      id: c.id.toLowerCase(),
      numero: c.numero,
      montoClp: Number(c.monto_clp),
      estado: c.estado,
      version: c.version,
      esPrincipal: !!c.es_principal,
      fecha: c.fecha,
    })),
    tickets: ticketsVinculados.map((t) => ({
      id: t.id.toLowerCase(),
      numero: t.numero,
      asunto: t.asunto,
      estado: t.estado,
      canal: t.canal,
      esOrigen: !!t.es_origen,
    })),
  };
}

// ------------------------------------------------------------------ escritura

export interface CrearOtInput {
  titulo: string;
  descripcion: string;
  esInterna: boolean;
  clienteId?: string | undefined;
  areaInterna?: string | undefined;
  categoria: Ot["categoria"];
  prioridad: Prioridad;
  origen: Ot["origen"];
  ubicacion?: string | undefined;
  solicitanteNombre?: string | undefined;
  solicitanteContacto?: string | undefined;
  fechaEstimadaTermino?: string | undefined;
  responsableId?: string | undefined;
  colaboradorIds?: string[] | undefined;
}

async function exigirClienteActivo(manager: ManagerTransaccional, clienteId: string): Promise<void> {
  const c = await manager.findOne(Cliente, { where: { id: clienteId } });
  if (!c || !c.activo) throw new AppError(400, "CLIENTE_INVALIDO", "clienteId debe ser un cliente existente y activo");
}

export async function crearOt(actor: UsuarioActor, input: CrearOtInput) {
  const otId = randomUUID();
  await enTransaccion(AppDataSource, async (m) => {
    if (!input.esInterna) await exigirClienteActivo(m, input.clienteId!);

    const responsableId = input.responsableId ?? actor.id;
    await usuarioAsignable(m, responsableId, "RESPONSABLE_INVALIDO", "El responsable");
    const colaboradorIds = [...new Set(input.colaboradorIds ?? [])];
    if (colaboradorIds.includes(responsableId)) {
      throw new AppError(400, "COLABORADOR_INVALIDO", "El responsable no puede ser además colaborador");
    }
    for (const cid of colaboradorIds) await usuarioAsignable(m, cid, "COLABORADOR_INVALIDO", "Cada colaborador");

    const numero = await siguienteFolio(m, "OT");
    const ot = await m.save(
      Ot,
      m.create(Ot, {
        id: otId,
        numero,
        titulo: input.titulo,
        descripcion: input.descripcion,
        esInterna: input.esInterna,
        clienteId: input.esInterna ? null : input.clienteId!,
        areaInterna: input.esInterna ? input.areaInterna! : null,
        categoria: input.categoria,
        prioridad: input.prioridad,
        origen: input.origen,
        ubicacion: input.ubicacion ?? null,
        solicitanteNombre: input.solicitanteNombre ?? null,
        solicitanteContacto: input.solicitanteContacto ?? null,
        fechaEstimadaTermino: input.fechaEstimadaTermino ?? null,
        estado: EstadoOt.INGRESADO,
        recepcionadoPorId: actor.id, // siempre el usuario autenticado, nunca el body
        responsableActualId: responsableId,
      }),
    );

    // Primer tramo de la cadena, desde el ingreso. SQL directo: asignacion tiene triggers y
    // TypeORM añadiría OUTPUT, que SQL Server rechaza en tablas con triggers (error 334).
    await m.query(
      `INSERT INTO asignacion (id, entidad_tipo, entidad_id, usuario_id, desde) VALUES (@0, 'ot', @1, @2, CAST(@3 AS datetimeoffset(3)))`,
      [randomUUID(), otId, responsableId, ot.fechaIngreso.toISOString()],
    );
    for (const cid of colaboradorIds) {
      await m.insert(OtColaborador, { otId, usuarioId: cid, agregadoPorId: actor.id });
    }
    await registrarEventoOt(m, otId, actor.id, {
      tipo: "creado",
      numero,
      responsableId,
      clienteId: ot.clienteId,
      esInterna: ot.esInterna,
    });
  });
  return obtenerDetalleOt(otId);
}

export interface ActualizarOtInput {
  titulo?: string | undefined;
  descripcion?: string | undefined;
  categoria?: Ot["categoria"] | undefined;
  prioridad?: Prioridad | undefined;
  ubicacion?: string | null | undefined;
  solicitanteNombre?: string | null | undefined;
  solicitanteContacto?: string | null | undefined;
  fechaEstimadaTermino?: string | null | undefined;
  clienteId?: string | undefined;
  areaInterna?: string | undefined;
}

export async function actualizarOt(actor: UsuarioActor, id: string, cambios: ActualizarOtInput) {
  await enTransaccion(AppDataSource, async (m) => {
    const ot = await bloquearOt(m, id);
    exigir(puedeEditarOt(await contextoOt(m, ot, actor)));

    // Refleja ot_interna_check: una interna solo cambia el área; una no interna solo el cliente.
    if (ot.esInterna && cambios.clienteId !== undefined) {
      throw new AppError(400, "VALIDATION_ERROR", "Una OT interna no puede tener clienteId");
    }
    if (!ot.esInterna && cambios.areaInterna !== undefined) {
      throw new AppError(400, "VALIDATION_ERROR", "areaInterna solo aplica a OT internas");
    }
    if (cambios.clienteId !== undefined && cambios.clienteId !== ot.clienteId) await exigirClienteActivo(m, cambios.clienteId);

    const editados: string[] = [];
    const aplicar = <K extends keyof Ot>(campo: K, valor: Ot[K] | undefined) => {
      if (valor === undefined || valor === ot[campo]) return;
      ot[campo] = valor;
      editados.push(String(campo));
    };
    aplicar("titulo", cambios.titulo);
    aplicar("descripcion", cambios.descripcion);
    aplicar("categoria", cambios.categoria);
    aplicar("ubicacion", cambios.ubicacion);
    aplicar("solicitanteNombre", cambios.solicitanteNombre);
    aplicar("solicitanteContacto", cambios.solicitanteContacto);
    aplicar("fechaEstimadaTermino", cambios.fechaEstimadaTermino);
    aplicar("clienteId", cambios.clienteId);
    aplicar("areaInterna", cambios.areaInterna);

    let prioridadAnterior: Prioridad | null = null;
    if (cambios.prioridad !== undefined && cambios.prioridad !== ot.prioridad) {
      prioridadAnterior = ot.prioridad;
      ot.prioridad = cambios.prioridad;
    }

    if (editados.length === 0 && prioridadAnterior === null) return; // nada cambió: sin UPDATE ni evento
    await m.save(Ot, ot);

    if (prioridadAnterior !== null) {
      await registrarEventoOt(m, id, actor.id, { tipo: "prioridad_cambiada", de: prioridadAnterior, a: ot.prioridad });
    }
    if (editados.length > 0) await registrarEventoOt(m, id, actor.id, { tipo: "ot_editada", campos: editados });
  });
  return obtenerDetalleOt(id);
}

export async function cambiarEstadoOt(actor: UsuarioActor, id: string, nuevo: EstadoOt) {
  await enTransaccion(AppDataSource, async (m) => {
    const ot = await bloquearOt(m, id);
    exigir(puedeCambiarEstado(await contextoOt(m, ot, actor)));
    if (ot.estado === nuevo) throw new AppError(409, "ESTADO_SIN_CAMBIO", `La OT ya está en estado ${nuevo}`);

    const anterior = ot.estado;
    ot.estado = nuevo;
    // Se fija una sola vez: retroceder de estado no lo borra.
    if ((nuevo === EstadoOt.TERMINADO || nuevo === EstadoOt.FACTURADO) && ot.terminadoEn === null) {
      ot.terminadoEn = await ahoraDb(m);
    }
    await m.save(Ot, ot);
    await registrarEventoOt(m, id, actor.id, { tipo: "estado_cambiado", de: anterior, a: nuevo });
  });
  return obtenerDetalleOt(id);
}
