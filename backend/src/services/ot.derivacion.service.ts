import { AppDataSource } from "../config/dataSource.js";
import { Ot } from "../entities/Ot.js";
import { OtColaborador } from "../entities/OtColaborador.js";
import { EntidadAsignable } from "../entities/enums.js";
import { AppError } from "../errors/AppError.js";
import { conflictoConcurrencia } from "../errors/dbErrors.js";
import { exigir, puedeDerivar } from "../policies/ot.policy.js";
import { moverTramoResponsable, notificarDerivacion } from "./asignacion.service.js";
import { registrarEventoOt } from "./evento.service.js";
import { enTransaccion } from "./folio.service.js";
import { bloquearOt, contextoOt, otNoEncontrada, usuarioAsignable, type UsuarioActor } from "./ot.common.js";
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

      // Mecánica de tramos generalizada (Fase 3, asignacion.service.ts): cerrar y abrir con el
      // mismo instante, los tramos son [desde, hasta) y no se solapan.
      await moverTramoResponsable(m, {
        entidadTipo: EntidadAsignable.OT,
        entidadId: id,
        destinoId: input.destinoId,
        motivoEntrada: input.motivo,
        derivadoPorId: actor.id,
      });

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
      await notificarDerivacion(m, input.destinoId, EntidadAsignable.OT, id, `${ot.numero} fue derivada a ti`, input.motivo);
    });
  } catch (err) {
    throw conflictoConcurrencia(err) ?? err;
  }
  return obtenerDetalleOt(id);
}
