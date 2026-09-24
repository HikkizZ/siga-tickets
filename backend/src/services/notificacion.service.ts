import { IsNull } from "typeorm";
import { AppDataSource } from "../config/dataSource.js";
import { Notificacion } from "../entities/Notificacion.js";
import { Usuario } from "../entities/Usuario.js";
import { Rol, type EntidadAsignable } from "../entities/enums.js";
import { AppError } from "../errors/AppError.js";
import { ahoraDb } from "./ot.common.js";
import { enTransaccion, type ManagerTransaccional } from "./folio.service.js";

export interface NotificacionDto {
  id: string;
  tipo: string;
  entidadTipo: string;
  entidadId: string;
  titulo: string;
  cuerpo: string;
  leidaEn: Date | null;
  creadoEn: Date;
}

const toDto = (n: Notificacion): NotificacionDto => ({
  id: n.id,
  tipo: n.tipo,
  entidadTipo: n.entidadTipo,
  entidadId: n.entidadId,
  titulo: n.titulo,
  cuerpo: n.cuerpo,
  leidaEn: n.leidaEn,
  creadoEn: n.creadoEn,
});

// Notificación de transición de SLA (jobs/slaJob.ts): solo se llama en el instante en que
// sla_estado CAMBIA hacia por_vencer o vencida (nunca en una des-escalada ni en un recálculo sin
// cambio), y solo si la entidad tiene responsable actual.
export async function notificarSla(
  manager: ManagerTransaccional,
  usuarioId: string,
  entidadTipo: EntidadAsignable,
  entidadId: string,
  numero: string,
  nuevoEstado: "por_vencer" | "vencida",
): Promise<void> {
  const vencida = nuevoEstado === "vencida";
  await manager.insert(Notificacion, {
    usuarioId,
    tipo: vencida ? "sla_vencida" : "sla_por_vencer",
    entidadTipo,
    entidadId,
    titulo: vencida ? `${numero} venció su SLA` : `${numero} está por vencer su SLA`,
    cuerpo: vencida ? `El plazo de ${numero} se cumplió.` : `El plazo de ${numero} está por cumplirse.`,
  });
}

// Aviso in-app a TODOS los admin activos cuando un correo saliente agota sus reintentos (Fase 5,
// jobs/correoSalienteJob.ts). Mismo patrón que notificarSla: se llama dentro de la MISMA
// transacción que marca el correo 'fallido'.
export async function notificarCorreoFallido(
  manager: ManagerTransaccional,
  correoId: string,
  para: string,
  asunto: string,
): Promise<void> {
  const admins = await manager.find(Usuario, { where: { rol: Rol.ADMIN, activo: true } });
  for (const admin of admins) {
    await manager.insert(Notificacion, {
      usuarioId: admin.id,
      tipo: "correo_fallido",
      entidadTipo: "correo_saliente",
      entidadId: correoId,
      titulo: `No se pudo enviar un correo a ${para}`,
      cuerpo: `El correo "${asunto}" agotó sus reintentos y quedó en estado fallido.`,
    });
  }
}

export async function listarNotificaciones(
  usuarioId: string,
  opts: { page: number; perPage: number; soloNoLeidas?: boolean | undefined },
): Promise<{ data: NotificacionDto[]; meta: { page: number; perPage: number; total: number } }> {
  const repo = AppDataSource.getRepository(Notificacion);
  const where: Record<string, unknown> = { usuarioId };
  if (opts.soloNoLeidas) where.leidaEn = IsNull();

  const [filas, total] = await repo.findAndCount({
    where,
    order: { creadoEn: "DESC" },
    skip: opts.perPage * (opts.page - 1),
    take: opts.perPage,
  });
  return { data: filas.map(toDto), meta: { page: opts.page, perPage: opts.perPage, total } };
}

// 404 idéntico si la notificación no existe O si es de otro usuario (nunca se revela cuál de las
// dos cosas pasó, por privacidad: ver encargo de la Fase 4).
export async function marcarLeida(actorId: string, id: string): Promise<void> {
  await enTransaccion(AppDataSource, async (m) => {
    const n = await m.findOne(Notificacion, { where: { id, usuarioId: actorId } });
    if (!n) throw new AppError(404, "NOTIFICACION_NO_ENCONTRADA", "Notificación no encontrada");
    if (n.leidaEn === null) {
      n.leidaEn = await ahoraDb(m);
      await m.save(Notificacion, n);
    }
  });
}

export async function marcarTodasLeidas(actorId: string): Promise<void> {
  await enTransaccion(AppDataSource, async (m) => {
    const ahora = await ahoraDb(m);
    await m.update(Notificacion, { usuarioId: actorId, leidaEn: IsNull() }, { leidaEn: ahora });
  });
}

const LIMITE_ITEMS_RESUMEN = 5;

interface FilaResumen {
  id: string;
  numero: string;
}

function bloqueResumen(filas: FilaResumen[]): { total: number; items: Array<{ id: string; numero: string }> } {
  return {
    total: filas.length,
    items: filas.slice(0, LIMITE_ITEMS_RESUMEN).map((f) => ({ id: f.id.toLowerCase(), numero: f.numero })),
  };
}

// GET /notificaciones/resumen: panorama operativo de TODO el equipo (no solo lo propio del
// actor — decisión documentada en docs/backend-diseno.md). Cada campo es un conteo + una lista
// corta (máx. 5) de {id,numero} para que el frontend pueda enlazar directo, sin otra consulta.
export async function resumenNotificaciones(): Promise<{
  otVencidas: ReturnType<typeof bloqueResumen>;
  otPrioridadAltaAbiertas: ReturnType<typeof bloqueResumen>;
  otPendientesCotizarOAprobar: ReturnType<typeof bloqueResumen>;
  ticketsNuevosSinResponder: ReturnType<typeof bloqueResumen>;
}> {
  const [otVencidas, otAlta, otCotiz, ticketsNuevos] = await Promise.all([
    AppDataSource.query(
      `SELECT id, numero FROM ot WHERE sla_estado = 'vencida' AND estado NOT IN ('terminado','facturado')
       ORDER BY sla_resolucion_vence_en ASC`,
    ) as Promise<FilaResumen[]>,
    AppDataSource.query(
      `SELECT o.id, o.numero FROM ot o JOIN prioridad p ON p.id = o.prioridad_id
       WHERE p.nombre = N'Alta' AND o.estado NOT IN ('terminado','facturado')
       ORDER BY o.fecha_ingreso ASC`,
    ) as Promise<FilaResumen[]>,
    AppDataSource.query(
      `SELECT o.id, o.numero FROM ot o
       WHERE o.estado = 'en_cotizacion' OR EXISTS (SELECT 1 FROM cotizacion c WHERE c.ot_id = o.id AND c.estado = 'enviada')
       ORDER BY o.fecha_ingreso ASC`,
    ) as Promise<FilaResumen[]>,
    // Fase C: "nuevo" ya no es un valor de enum; se identifica por el flag esEstadoInicial (ver
    // entities/EstadoTicket.ts), no por nombre.
    AppDataSource.query(
      `SELECT t.id, t.numero FROM ticket t JOIN estado_ticket e ON e.id = t.estado_id
       WHERE e.es_estado_inicial = 1 ORDER BY t.fecha_ingreso ASC`,
    ) as Promise<FilaResumen[]>,
  ]);

  return {
    otVencidas: bloqueResumen(otVencidas),
    otPrioridadAltaAbiertas: bloqueResumen(otAlta),
    otPendientesCotizarOAprobar: bloqueResumen(otCotiz),
    ticketsNuevosSinResponder: bloqueResumen(ticketsNuevos),
  };
}
