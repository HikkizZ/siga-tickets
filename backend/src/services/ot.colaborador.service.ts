import { AppDataSource } from "../config/dataSource.js";
import { OtColaborador } from "../entities/OtColaborador.js";
import { AppError } from "../errors/AppError.js";
import { conflictoConcurrencia, violacionUnica } from "../errors/dbErrors.js";
import { exigir, puedeAgregarColaborador, puedeGestionarColaboradores } from "../policies/ot.policy.js";
import { registrarEventoOt } from "./evento.service.js";
import { enTransaccion } from "./folio.service.js";
import { bloquearOt, contextoOt, usuarioAsignable, type UsuarioActor } from "./ot.common.js";

const MSG_PERMISO = "Solo el responsable actual, gestión o admin gestionan colaboradores";
const MSG_PERMISO_AGREGAR = "Solo puedes añadirte a ti mismo; añadir a otra persona lo hacen el responsable actual, gestión o admin";

export async function listarColaboradores(otId: string) {
  const filas = await AppDataSource.getRepository(OtColaborador).find({
    where: { otId },
    relations: { usuario: true },
    order: { creadoEn: "ASC" },
  });
  return filas.map((c) => ({ id: c.usuario.id, nombre: c.usuario.nombre }));
}

export async function agregarColaborador(actor: UsuarioActor, otId: string, usuarioId: string) {
  try {
    await enTransaccion(AppDataSource, async (m) => {
      const ot = await bloquearOt(m, otId);
      exigir(puedeAgregarColaborador(await contextoOt(m, ot, actor), usuarioId), MSG_PERMISO_AGREGAR);

      if (usuarioId === ot.responsableActualId) {
        throw new AppError(400, "COLABORADOR_INVALIDO", "El responsable actual no puede ser colaborador");
      }
      await usuarioAsignable(m, usuarioId, "COLABORADOR_INVALIDO", "El colaborador");

      await m.insert(OtColaborador, { otId, usuarioId, agregadoPorId: actor.id });
      await registrarEventoOt(m, otId, actor.id, { tipo: "colaborador_agregado", usuarioId });
    });
  } catch (err) {
    if (violacionUnica(err)) throw new AppError(409, "COLABORADOR_DUPLICADO", "El usuario ya es colaborador de la OT");
    throw conflictoConcurrencia(err) ?? err;
  }
  return listarColaboradores(otId);
}

export async function quitarColaborador(actor: UsuarioActor, otId: string, usuarioId: string): Promise<void> {
  await enTransaccion(AppDataSource, async (m) => {
    const ot = await bloquearOt(m, otId);
    exigir(puedeGestionarColaboradores(await contextoOt(m, ot, actor)), MSG_PERMISO);

    const r = await m.delete(OtColaborador, { otId, usuarioId });
    if (!r.affected) throw new AppError(404, "COLABORADOR_NO_ENCONTRADO", "Ese usuario no es colaborador de la OT");
    await registrarEventoOt(m, otId, actor.id, { tipo: "colaborador_quitado", usuarioId });
  });
}
