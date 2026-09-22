import { randomUUID } from "node:crypto";
import { AppDataSource } from "../config/dataSource.js";
import { Cliente } from "../entities/Cliente.js";
import { Cotizacion } from "../entities/Cotizacion.js";
import { Ot } from "../entities/Ot.js";
import { EstadoCotizacion } from "../entities/enums.js";
import { AppError } from "../errors/AppError.js";
import { conflictoConcurrencia } from "../errors/dbErrors.js";
import { exigirEscrituraCotizacion } from "../policies/cotizacion.policy.js";
import type { FiltrosCotizacion } from "../validations/cotizacion.validation.js";
import { registrarEventoCotizacion, registrarEventoOt } from "./evento.service.js";
import { enTransaccion, siguienteFolio, type ManagerTransaccional } from "./folio.service.js";
import { ahoraDb, bloquearOt, type UsuarioActor } from "./ot.common.js";
import { escaparLike, obtenerDetalleOt } from "./ot.service.js";

export function cotizacionNoEncontrada(): AppError {
  return new AppError(404, "COTIZACION_NO_ENCONTRADA", "Cotización no encontrada");
}

// Toma el lock de la fila (UPDLOCK) hasta el fin de la transacción, igual que bloquearOt: sirve
// tanto para editar/cambiar estado (evita pisarse con otra escritura) como, en la creación con
// otId, para leer MAX(version) y decidir es_principal sin condiciones de carrera.
async function bloquearCotizacion(manager: ManagerTransaccional, id: string): Promise<Cotizacion> {
  const cot = await manager.findOne(Cotizacion, { where: { id }, lock: { mode: "pessimistic_write" } });
  if (!cot) throw cotizacionNoEncontrada();
  return cot;
}

async function exigirClienteActivoCot(manager: ManagerTransaccional, clienteId: string): Promise<void> {
  const c = await manager.findOne(Cliente, { where: { id: clienteId } });
  if (!c || !c.activo) throw new AppError(400, "CLIENTE_INVALIDO", "clienteId debe ser un cliente existente y activo");
}

// ------------------------------------------------------------------ DTOs

function toCotizacionBaseDto(c: Cotizacion) {
  return {
    id: c.id,
    numero: c.numero,
    ot: c.ot ? { id: c.ot.id, numero: c.ot.numero, titulo: c.ot.titulo } : null,
    cliente: c.cliente ? { id: c.cliente.id, nombre: c.cliente.nombre } : null,
    montoClp: c.montoClp,
    fecha: c.fecha,
    estado: c.estado,
    version: c.version,
    esPrincipal: c.esPrincipal,
    aprobadaEn: c.aprobadaEn,
    creadoEn: c.creadoEn,
    actualizadoEn: c.actualizadoEn,
  };
}

// (El resumen de cotizaciones que usa GET /ots/:id vive en ot.service.ts, con su propia consulta
// cruda: importar este módulo desde allá crearía un ciclo, porque este módulo ya importa de
// ot.service.ts para escaparLike y obtenerDetalleOt.)

// ------------------------------------------------------------------ listado

const SELECT_BASE_COT = `
  SELECT co.id, co.numero, co.ot_id, co.monto_clp, CONVERT(varchar(10), co.fecha, 23) AS fecha,
         co.estado, co.version, co.es_principal, co.creado_en, co.actualizado_en,
         o.numero AS ot_numero, o.titulo AS ot_titulo,
         cl.id AS cliente_id, cl.nombre AS cliente_nombre
  FROM cotizacion co
  LEFT JOIN ot o ON o.id = co.ot_id
  LEFT JOIN cliente cl ON cl.id = co.cliente_id`;

interface FilaCotizacion {
  id: string;
  numero: string;
  ot_id: string | null;
  monto_clp: string;
  fecha: string;
  estado: string;
  version: number;
  es_principal: boolean;
  creado_en: Date;
  actualizado_en: Date;
  ot_numero: string | null;
  ot_titulo: string | null;
  cliente_id: string | null;
  cliente_nombre: string | null;
}

function filaToListDto(r: FilaCotizacion) {
  return {
    id: r.id.toLowerCase(),
    numero: r.numero,
    ot: r.ot_id ? { id: r.ot_id.toLowerCase(), numero: r.ot_numero!, titulo: r.ot_titulo! } : null,
    cliente: r.cliente_id ? { id: r.cliente_id.toLowerCase(), nombre: r.cliente_nombre! } : null,
    montoClp: Number(r.monto_clp),
    fecha: r.fecha,
    estado: r.estado,
    version: r.version,
    esPrincipal: !!r.es_principal,
    creadoEn: r.creado_en,
    actualizadoEn: r.actualizado_en,
  };
}

// Lista blanca de orden: el nombre llega del cliente, jamás se interpola tal cual.
const ORDEN_SQL_COT: Record<string, string> = {
  numero: "co.numero",
  fecha: "co.fecha",
  montoClp: "co.monto_clp",
  estado: "co.estado",
  version: "co.version",
  creadoEn: "co.creado_en",
  actualizadoEn: "co.actualizado_en",
};

function construirFiltrosCotizacion(f: FiltrosCotizacion): { where: string; params: unknown[] } {
  const params: unknown[] = [];
  const p = (v: unknown) => `@${params.push(v) - 1}`;
  const w: string[] = [];

  if (f.estado) w.push(`co.estado = ${p(f.estado)}`);
  if (f.clienteId) w.push(`co.cliente_id = ${p(f.clienteId)}`);
  if (f.otId) w.push(`co.ot_id = ${p(f.otId)}`);
  if (f.q) {
    const like = p(`%${escaparLike(f.q)}%`);
    w.push(`(co.numero LIKE ${like} ESCAPE '\\' OR cl.nombre LIKE ${like} ESCAPE '\\')`);
  }
  if (f.desde) w.push(`co.fecha >= ${p(f.desde)}`);
  if (f.hasta) w.push(`co.fecha <= ${p(f.hasta)}`);

  return { where: w.length ? `WHERE ${w.join(" AND ")}` : "", params };
}

export async function listarCotizaciones(
  filtros: FiltrosCotizacion & { page: number; perPage: number; orden: string; dir: "asc" | "desc" },
) {
  const { where, params } = construirFiltrosCotizacion(filtros);
  const expr = ORDEN_SQL_COT[filtros.orden];
  if (!expr) throw new AppError(400, "VALIDATION_ERROR", "Columna de orden no permitida");
  const dir = filtros.dir === "asc" ? "ASC" : "DESC";

  const [{ total }] = (await AppDataSource.query(
    `SELECT COUNT(*) AS total FROM cotizacion co LEFT JOIN cliente cl ON cl.id = co.cliente_id ${where}`,
    params,
  )) as Array<{ total: number }>;
  const filas: FilaCotizacion[] = await AppDataSource.query(
    `${SELECT_BASE_COT} ${where}
     ORDER BY ${expr} ${dir}${filtros.orden === "numero" ? "" : `, co.numero ${dir}`}
     OFFSET ${filtros.perPage * (filtros.page - 1)} ROWS FETCH NEXT ${filtros.perPage} ROWS ONLY`,
    params,
  );

  return { data: filas.map(filaToListDto), meta: { page: filtros.page, perPage: filtros.perPage, total } };
}

// ------------------------------------------------------------------ detalle

export async function obtenerDetalleCotizacion(id: string) {
  const cot = await AppDataSource.getRepository(Cotizacion).findOne({ where: { id }, relations: { ot: true, cliente: true } });
  if (!cot) throw cotizacionNoEncontrada();

  // Timeline propio: todos los eventos con entidad_tipo='cotizacion' de esta cotización (creado
  // por registrarEventoCotizacion: hoy cotizacion_editada y cotizacion_estado_cambiado), más los
  // eventos de la OT que SOLO existen ahí (cotizacion_creada, cotizacion_vinculada — no tienen
  // copia en el lado cotización). cotizacion_estado_cambiado se excluye de este segundo grupo
  // a propósito: cambiarEstadoCotizacion ya la escribe en el lado cotización, y sumarla también
  // desde el lado OT duplicaría cada transición. Criterio simple: el "dueño" de cada tipo de
  // evento decide en qué entidad_tipo vive; el otro lado, si aplica, solo lo referencia por
  // `cotizacionId` para que la OT lo muestre en su propio timeline (ver obtenerDetalleOt).
  const filas: Array<{ id: string; tipo: string; actor_id: string | null; actor_nombre: string | null; payload: string; ocurrido_en: Date }> =
    await AppDataSource.query(
      `SELECT CAST(e.id AS nvarchar(20)) AS id, e.tipo, e.actor_id, u.nombre AS actor_nombre, e.payload, e.ocurrido_en
       FROM evento e
       LEFT JOIN usuario u ON u.id = e.actor_id
       WHERE (e.entidad_tipo = 'cotizacion' AND e.entidad_id = @0)
          OR (e.entidad_tipo = 'ot' AND e.tipo IN ('cotizacion_creada', 'cotizacion_vinculada') AND JSON_VALUE(e.payload, '$.cotizacionId') = @1)
       ORDER BY e.ocurrido_en DESC, e.id DESC`,
      [id, id],
    );

  return {
    ...toCotizacionBaseDto(cot),
    eventos: filas.map((f) => ({
      id: f.id,
      tipo: f.tipo,
      actor: f.actor_id ? { id: String(f.actor_id).toLowerCase(), nombre: f.actor_nombre ?? "" } : null,
      payload: JSON.parse(f.payload),
      ocurridoEn: f.ocurrido_en,
    })),
  };
}

// ------------------------------------------------------------------ escritura

export interface CrearCotizacionInput {
  otId?: string | undefined;
  clienteId?: string | undefined;
  montoClp: number;
  fecha?: string | undefined;
  esPrincipal: boolean;
}

export async function crearCotizacion(actor: UsuarioActor, input: CrearCotizacionInput) {
  exigirEscrituraCotizacion(actor.rol);
  const cotizacionId = randomUUID();

  try {
    await enTransaccion(AppDataSource, async (m) => {
      // bloquearOt también sirve de barrera: serializa cualquier otra creación/vinculación de
      // cotizaciones sobre la misma OT (MAX(version) y es_principal quedan libres de carrera).
      const ot = input.otId ? await bloquearOt(m, input.otId) : null;

      let clienteId = input.clienteId ?? null;
      if (ot && !ot.esInterna) {
        if (clienteId === null) {
          clienteId = ot.clienteId;
        } else if (clienteId !== ot.clienteId) {
          throw new AppError(400, "CLIENTE_NO_COINCIDE", "clienteId no coincide con el cliente de la OT");
        }
      }
      // Sin otId, clienteId ya es obligatorio por Zod (crearCotizacionReq.superRefine).
      if (clienteId) await exigirClienteActivoCot(m, clienteId);

      let version = 1;
      if (input.otId) {
        const [{ siguiente }] = (await m.query(`SELECT ISNULL(MAX(version), 0) + 1 AS siguiente FROM cotizacion WHERE ot_id = @0`, [
          input.otId,
        ])) as Array<{ siguiente: number }>;
        version = siguiente;
      }

      const numero = await siguienteFolio(m, "COT");

      if (input.esPrincipal && input.otId) {
        await m.query(
          `UPDATE cotizacion SET es_principal = 0, actualizado_en = SYSDATETIMEOFFSET() WHERE ot_id = @0 AND es_principal = 1`,
          [input.otId],
        );
      }

      await m.save(
        Cotizacion,
        m.create(Cotizacion, {
          id: cotizacionId,
          numero,
          otId: input.otId ?? null,
          clienteId,
          montoClp: input.montoClp,
          estado: EstadoCotizacion.BORRADOR,
          version,
          esPrincipal: input.esPrincipal,
          ...(input.fecha !== undefined ? { fecha: input.fecha } : {}),
        }),
      );

      if (input.otId) {
        await registrarEventoOt(m, input.otId, actor.id, { tipo: "cotizacion_creada", cotizacionId, numero });
      }
    });
  } catch (err) {
    throw conflictoConcurrencia(err) ?? err;
  }

  return obtenerDetalleCotizacion(cotizacionId);
}

export interface ActualizarCotizacionInput {
  montoClp?: number | undefined;
  fecha?: string | undefined;
  clienteId?: string | undefined;
}

export async function actualizarCotizacion(actor: UsuarioActor, id: string, cambios: ActualizarCotizacionInput) {
  exigirEscrituraCotizacion(actor.rol);

  await enTransaccion(AppDataSource, async (m) => {
    const cot = await bloquearCotizacion(m, id);
    if (cot.estado !== EstadoCotizacion.BORRADOR) {
      throw new AppError(409, "COTIZACION_ESTADO_INVALIDO", "Solo se puede editar una cotización en estado borrador");
    }

    if (cambios.clienteId !== undefined && cambios.clienteId !== cot.clienteId) {
      if (cot.otId) {
        const ot = await m.findOne(Ot, { where: { id: cot.otId } });
        if (ot && !ot.esInterna && cambios.clienteId !== ot.clienteId) {
          throw new AppError(400, "CLIENTE_NO_COINCIDE", "clienteId no coincide con el cliente de la OT");
        }
      }
      await exigirClienteActivoCot(m, cambios.clienteId);
    }

    const campos: string[] = [];
    const montoAntes = cot.montoClp;
    if (cambios.montoClp !== undefined && cambios.montoClp !== cot.montoClp) {
      cot.montoClp = cambios.montoClp;
      campos.push("montoClp");
    }
    if (cambios.fecha !== undefined && cambios.fecha !== cot.fecha) {
      cot.fecha = cambios.fecha;
      campos.push("fecha");
    }
    if (cambios.clienteId !== undefined && cambios.clienteId !== cot.clienteId) {
      cot.clienteId = cambios.clienteId;
      campos.push("clienteId");
    }

    if (campos.length === 0) return; // nada cambió: sin UPDATE ni evento

    await m.save(Cotizacion, cot);
    await registrarEventoCotizacion(m, id, actor.id, {
      tipo: "cotizacion_editada",
      campos,
      montoClpAntes: montoAntes,
      montoClpDespues: cot.montoClp,
    });
  });

  return obtenerDetalleCotizacion(id);
}

// borrador→enviada, enviada→aprobada|rechazada|borrador, rechazada→enviada. Cualquier otra
// transición (incluida la misma → la misma) no está en la lista y cae en el 409 de abajo.
const TRANSICIONES: Record<EstadoCotizacion, EstadoCotizacion[]> = {
  [EstadoCotizacion.BORRADOR]: [EstadoCotizacion.ENVIADA],
  [EstadoCotizacion.ENVIADA]: [EstadoCotizacion.APROBADA, EstadoCotizacion.RECHAZADA, EstadoCotizacion.BORRADOR],
  [EstadoCotizacion.APROBADA]: [],
  [EstadoCotizacion.RECHAZADA]: [EstadoCotizacion.ENVIADA],
};

export async function cambiarEstadoCotizacion(actor: UsuarioActor, id: string, nuevo: EstadoCotizacion) {
  exigirEscrituraCotizacion(actor.rol);

  await enTransaccion(AppDataSource, async (m) => {
    const cot = await bloquearCotizacion(m, id);
    if (!TRANSICIONES[cot.estado].includes(nuevo)) {
      throw new AppError(409, "TRANSICION_INVALIDA", `No se puede pasar de ${cot.estado} a ${nuevo}`);
    }

    const anterior = cot.estado;
    cot.estado = nuevo;
    // Se fija una sola vez: si ya había sido aprobada antes, no se pisa (defensivo; con las
    // transiciones permitidas hoy no hay forma de volver a 'aprobada' una segunda vez).
    if (nuevo === EstadoCotizacion.APROBADA && cot.aprobadaEn === null) {
      cot.aprobadaEn = await ahoraDb(m);
    }
    await m.save(Cotizacion, cot);

    await registrarEventoCotizacion(m, id, actor.id, { tipo: "cotizacion_estado_cambiado", de: anterior, a: nuevo });
    // Si tiene OT, el cambio también queda en el timeline de la OT (mismo criterio que
    // obtenerDetalleCotizacion usa para reconstruir el timeline propio con JSON_VALUE).
    if (cot.otId) {
      await registrarEventoOt(m, cot.otId, actor.id, { tipo: "cotizacion_estado_cambiado", cotizacionId: id, de: anterior, a: nuevo });
    }
  });

  return obtenerDetalleCotizacion(id);
}

// POST /ots/:id/cotizaciones/vincular: liga una cotización EXISTENTE (sin otId, o de otra OT) a
// esta OT. El controlador vive en ot.controller.ts (la ruta cuelga de /ots), la lógica aquí.
export async function vincularCotizacion(actor: UsuarioActor, otId: string, cotizacionId: string) {
  exigirEscrituraCotizacion(actor.rol);

  try {
    await enTransaccion(AppDataSource, async (m) => {
      await bloquearOt(m, otId); // 404 OT_NO_ENCONTRADA si no existe; también sirve de barrera
      const cot = await bloquearCotizacion(m, cotizacionId);

      const otAnteriorId = cot.otId;
      const yaEstabaAqui = otAnteriorId === otId;

      // Evita reasignar el historial cerrado de OTRA OT por error; una cotización sin OT se
      // puede vincular en cualquier estado, y volver a vincular a la MISMA OT nunca rompe nada.
      if (!yaEstabaAqui && otAnteriorId !== null) {
        if (cot.estado === EstadoCotizacion.APROBADA || cot.estado === EstadoCotizacion.RECHAZADA) {
          throw new AppError(409, "COTIZACION_NO_VINCULABLE", "No se puede reasignar una cotización aprobada o rechazada de otra OT");
        }
      }

      let version = cot.version;
      if (otAnteriorId === null) {
        const [{ siguiente }] = (await m.query(`SELECT ISNULL(MAX(version), 0) + 1 AS siguiente FROM cotizacion WHERE ot_id = @0`, [
          otId,
        ])) as Array<{ siguiente: number }>;
        version = siguiente;
      }

      if (cot.esPrincipal) {
        await m.query(
          `UPDATE cotizacion SET es_principal = 0, actualizado_en = SYSDATETIMEOFFSET() WHERE ot_id = @0 AND es_principal = 1 AND id <> @1`,
          [otId, cotizacionId],
        );
      }

      cot.otId = otId;
      cot.version = version;
      await m.save(Cotizacion, cot);

      await registrarEventoOt(m, otId, actor.id, { tipo: "cotizacion_vinculada", cotizacionId, numero: cot.numero });
    });
  } catch (err) {
    throw conflictoConcurrencia(err) ?? err;
  }

  return obtenerDetalleOt(otId);
}
