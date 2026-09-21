import { AppDataSource } from "../config/dataSource.js";
import { ComentarioOt } from "../entities/ComentarioOt.js";
import { EtapaOt } from "../entities/EtapaOt.js";
import { HoraTrabajada } from "../entities/HoraTrabajada.js";
import { Ot } from "../entities/Ot.js";
import { AppError } from "../errors/AppError.js";
import { exigir, puedeComentar, puedeEditarEtapas, puedeGestionarHoras, puedeRegistrarHoras } from "../policies/ot.policy.js";
import { registrarEventoOt } from "./evento.service.js";
import { enTransaccion } from "./folio.service.js";
import { bloquearOt, contextoOt, otNoEncontrada, usuarioAsignable, type UsuarioActor } from "./ot.common.js";
import { sumarHoras, toComentarioDto, toEtapaDto, toHoraDto } from "./ot.service.js";

const MSG_ETAPAS = "Solo el responsable actual, gestión o admin editan etapas";

async function exigirOtExiste(otId: string): Promise<void> {
  if (!(await AppDataSource.getRepository(Ot).exists({ where: { id: otId } }))) throw otNoEncontrada();
}

// ---------------------------------------------------------------- comentarios

export async function listarComentarios(otId: string) {
  await exigirOtExiste(otId);
  const filas = await AppDataSource.getRepository(ComentarioOt).find({
    where: { otId },
    relations: { autor: true },
    order: { creadoEn: "DESC" },
  });
  return filas.map(toComentarioDto);
}

export async function crearComentario(actor: UsuarioActor, otId: string, input: { cuerpo: string; visibleCliente: boolean }) {
  const comentarioId = await enTransaccion(AppDataSource, async (m) => {
    const ot = await bloquearOt(m, otId);
    exigir(puedeComentar(await contextoOt(m, ot, actor)));
    const c = await m.save(
      ComentarioOt,
      m.create(ComentarioOt, { otId, autorId: actor.id, cuerpo: input.cuerpo, visibleCliente: input.visibleCliente }),
    );
    await registrarEventoOt(m, otId, actor.id, { tipo: "comentario", comentarioId: c.id, visibleCliente: c.visibleCliente });
    return c.id;
  });
  const c = await AppDataSource.getRepository(ComentarioOt).findOneOrFail({ where: { id: comentarioId }, relations: { autor: true } });
  return toComentarioDto(c);
}

// ---------------------------------------------------------------- horas

async function horasDe(otId: string) {
  const filas = await AppDataSource.getRepository(HoraTrabajada).find({
    where: { otId },
    relations: { usuario: true },
    order: { fecha: "DESC", creadoEn: "DESC" },
  });
  return { total: sumarHoras(filas.map((h) => h.horas)), items: filas.map(toHoraDto) };
}

export async function listarHoras(otId: string) {
  await exigirOtExiste(otId);
  return horasDe(otId);
}

export async function registrarHoras(
  actor: UsuarioActor,
  otId: string,
  input: { fecha: string; horas: number; detalle?: string | undefined; usuarioId?: string | undefined },
) {
  const horaId = await enTransaccion(AppDataSource, async (m) => {
    const ot = await bloquearOt(m, otId);
    const ctx = await contextoOt(m, ot, actor);
    const usuarioId = input.usuarioId ?? actor.id;
    // Un tecnico solo registra las propias y solo en OT donde es responsable o colaborador.
    exigir(puedeRegistrarHoras(ctx, usuarioId), "Solo puedes registrar tus propias horas, y solo en OT donde eres responsable o colaborador");
    if (usuarioId !== actor.id) await usuarioAsignable(m, usuarioId, "USUARIO_INVALIDO", "usuarioId");

    const h = await m.save(
      HoraTrabajada,
      m.create(HoraTrabajada, { otId, usuarioId, fecha: input.fecha, horas: input.horas, detalle: input.detalle ?? null }),
    );
    await registrarEventoOt(m, otId, actor.id, {
      tipo: "horas_registradas",
      horaId: h.id,
      usuarioId,
      fecha: input.fecha,
      horas: input.horas,
    });
    return h.id;
  });
  const { total, items } = await horasDe(otId);
  return { hora: items.find((h) => h.id === horaId)!, total };
}

export async function eliminarHoras(actor: UsuarioActor, otId: string, horaId: string) {
  await enTransaccion(AppDataSource, async (m) => {
    const ot = await bloquearOt(m, otId);
    const ctx = await contextoOt(m, ot, actor);
    const hora = await m.findOne(HoraTrabajada, { where: { id: horaId, otId } });
    if (!hora) throw new AppError(404, "HORA_NO_ENCONTRADA", "Registro de horas no encontrado");
    exigir(puedeGestionarHoras(ctx, hora.usuarioId), "Solo puedes borrar tus propias horas");

    await m.delete(HoraTrabajada, { id: horaId });
    await registrarEventoOt(m, otId, actor.id, { tipo: "horas_eliminadas", horaId, usuarioId: hora.usuarioId, horas: hora.horas });
  });
  return { total: (await horasDe(otId)).total };
}

// ---------------------------------------------------------------- etapas

export async function listarEtapas(otId: string) {
  await exigirOtExiste(otId);
  const filas = await AppDataSource.getRepository(EtapaOt).find({ where: { otId }, order: { orden: "ASC", fechaInicio: "ASC" } });
  return filas.map(toEtapaDto);
}

export async function crearEtapa(
  actor: UsuarioActor,
  otId: string,
  input: { nombre: string; fechaInicio: string; fechaTermino: string; orden?: number | undefined },
) {
  const etapa = await enTransaccion(AppDataSource, async (m) => {
    const ot = await bloquearOt(m, otId);
    exigir(puedeEditarEtapas(await contextoOt(m, ot, actor)), MSG_ETAPAS);

    // Con el lock de la OT, el MAX no compite con otra alta simultánea.
    let orden = input.orden;
    if (orden === undefined) {
      const [{ siguiente }] = await m.query(`SELECT ISNULL(MAX(orden), 0) + 1 AS siguiente FROM etapa_ot WHERE ot_id = @0`, [otId]);
      orden = siguiente as number;
    }
    const e = await m.save(
      EtapaOt,
      m.create(EtapaOt, { otId, nombre: input.nombre, fechaInicio: input.fechaInicio, fechaTermino: input.fechaTermino, orden }),
    );
    await registrarEventoOt(m, otId, actor.id, { tipo: "etapa_creada", etapaId: e.id });
    return e;
  });
  return toEtapaDto(etapa);
}

export async function actualizarEtapa(
  actor: UsuarioActor,
  otId: string,
  etapaId: string,
  cambios: { nombre?: string | undefined; fechaInicio?: string | undefined; fechaTermino?: string | undefined; orden?: number | undefined },
) {
  const etapa = await enTransaccion(AppDataSource, async (m) => {
    const ot = await bloquearOt(m, otId);
    exigir(puedeEditarEtapas(await contextoOt(m, ot, actor)), MSG_ETAPAS);
    const e = await m.findOne(EtapaOt, { where: { id: etapaId, otId } });
    if (!e) throw new AppError(404, "ETAPA_NO_ENCONTRADA", "Etapa no encontrada");

    const campos: string[] = [];
    if (cambios.nombre !== undefined && cambios.nombre !== e.nombre) { e.nombre = cambios.nombre; campos.push("nombre"); }
    if (cambios.fechaInicio !== undefined && cambios.fechaInicio !== e.fechaInicio) { e.fechaInicio = cambios.fechaInicio; campos.push("fechaInicio"); }
    if (cambios.fechaTermino !== undefined && cambios.fechaTermino !== e.fechaTermino) { e.fechaTermino = cambios.fechaTermino; campos.push("fechaTermino"); }
    if (cambios.orden !== undefined && cambios.orden !== e.orden) { e.orden = cambios.orden; campos.push("orden"); }

    // Zod solo compara las fechas si vienen las dos; con una sola se contrasta con la guardada.
    if (e.fechaTermino < e.fechaInicio) {
      throw new AppError(400, "VALIDATION_ERROR", "fechaTermino no puede ser anterior a fechaInicio");
    }
    if (campos.length > 0) {
      await m.save(EtapaOt, e);
      await registrarEventoOt(m, otId, actor.id, { tipo: "etapa_editada", etapaId, campos });
    }
    return e;
  });
  return toEtapaDto(etapa);
}

export async function eliminarEtapa(actor: UsuarioActor, otId: string, etapaId: string): Promise<void> {
  await enTransaccion(AppDataSource, async (m) => {
    const ot = await bloquearOt(m, otId);
    exigir(puedeEditarEtapas(await contextoOt(m, ot, actor)), MSG_ETAPAS);
    const r = await m.delete(EtapaOt, { id: etapaId, otId });
    if (!r.affected) throw new AppError(404, "ETAPA_NO_ENCONTRADA", "Etapa no encontrada");
    await registrarEventoOt(m, otId, actor.id, { tipo: "etapa_eliminada", etapaId });
  });
}
