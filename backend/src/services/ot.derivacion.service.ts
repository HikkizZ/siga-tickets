import { randomUUID } from "node:crypto";
import { AppDataSource } from "../config/dataSource.js";
import { Notificacion } from "../entities/Notificacion.js";
import { Ot } from "../entities/Ot.js";
import { OtColaborador } from "../entities/OtColaborador.js";
import { AppError } from "../errors/AppError.js";
import { conflictoConcurrencia } from "../errors/dbErrors.js";
import { exigir, puedeDerivar } from "../policies/ot.policy.js";
import { registrarEventoOt } from "./evento.service.js";
import { enTransaccion } from "./folio.service.js";
import { ahoraDb, bloquearOt, contextoOt, otNoEncontrada, usuarioAsignable, type UsuarioActor } from "./ot.common.js";
import { obtenerDetalleOt } from "./ot.service.js";

export interface DerivarInput {
  destinoId: string;
  motivo: string;
  mantenerComoColaborador: boolean;
}

export async function derivarOt(actor: UsuarioActor, id: string, input: DerivarInput) {
  // Lo que el actor "vio" al decidir. Dentro de la transacción se comprueba que siga siendo así:
  // si otra derivación se confirmó entremedio, esta pierde con 409 (en vez de encadenarse en silencio
  // sobre un responsable que el actor no conocía).
  const vista = await AppDataSource.getRepository(Ot).findOne({ where: { id }, select: { id: true, responsableActualId: true } });
  if (!vista) throw otNoEncontrada();
  const responsableVisto = vista.responsableActualId;

  try {
    await enTransaccion(AppDataSource, async (m) => {
      const ot = await bloquearOt(m, id);
      if (ot.responsableActualId !== responsableVisto) {
        throw new AppError(409, "CONFLICTO_CONCURRENCIA", "La OT fue derivada por otra persona mientras tanto; reintenta");
      }
      exigir(puedeDerivar(await contextoOt(m, ot, actor)), "Solo el responsable actual, gestión o admin pueden derivar la OT");

      if (input.destinoId === ot.responsableActualId) {
        throw new AppError(400, "DERIVACION_INVALIDA", "El destino ya es el responsable actual");
      }
      await usuarioAsignable(m, input.destinoId, "DERIVACION_INVALIDA", "El destino");

      // hasta > desde es un CHECK: si la derivación cae en el mismo milisegundo que el inicio del tramo, se avanza 1 ms.
      const [abierto] = (await m.query(
        `SELECT id, desde FROM asignacion WHERE entidad_tipo = 'ot' AND entidad_id = @0 AND hasta IS NULL`,
        [id],
      )) as Array<{ id: string; desde: Date }>;
      let ahora = await ahoraDb(m);
      if (abierto && ahora.getTime() <= abierto.desde.getTime()) ahora = new Date(abierto.desde.getTime() + 1);
      const ahoraIso = ahora.toISOString();

      // Cerrar y abrir con el mismo instante: los tramos son [desde, hasta) y no se solapan.
      if (abierto) {
        await m.query(`UPDATE asignacion SET hasta = CAST(@0 AS datetimeoffset(3)) WHERE id = @1`, [ahoraIso, abierto.id]);
      }
      await m.query(
        `INSERT INTO asignacion (id, entidad_tipo, entidad_id, usuario_id, desde, motivo_entrada, derivado_por_id)
         VALUES (@0, 'ot', @1, @2, CAST(@3 AS datetimeoffset(3)), @4, @5)`,
        [randomUUID(), id, input.destinoId, ahoraIso, input.motivo, actor.id],
      );

      const anteriorId = ot.responsableActualId;
      // Colaborador ≠ responsable: si el destino colaboraba, deja de hacerlo.
      await m.delete(OtColaborador, { otId: id, usuarioId: input.destinoId });
      const mantener = input.mantenerComoColaborador && anteriorId !== null;
      if (mantener) await m.insert(OtColaborador, { otId: id, usuarioId: anteriorId, agregadoPorId: actor.id });

      ot.responsableActualId = input.destinoId;
      await m.save(Ot, ot); // el SLA no se toca

      await registrarEventoOt(m, id, actor.id, {
        tipo: "derivado",
        de: anteriorId,
        a: input.destinoId,
        motivo: input.motivo,
        mantuvoComoColaborador: mantener,
      });
      // El API de notificaciones llega en la fase 4; aquí solo se registra.
      await m.insert(Notificacion, {
        usuarioId: input.destinoId,
        tipo: "derivacion",
        entidadTipo: "ot",
        entidadId: id,
        titulo: `${ot.numero} fue derivada a ti`,
        cuerpo: input.motivo,
      });
    });
  } catch (err) {
    throw conflictoConcurrencia(err) ?? err;
  }
  return obtenerDetalleOt(id);
}
