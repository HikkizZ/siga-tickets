import { randomUUID } from "node:crypto";
import { Notificacion } from "../entities/Notificacion.js";
import { EntidadAsignable } from "../entities/enums.js";
import { ahoraDb } from "./ot.common.js";
import type { ManagerTransaccional } from "./folio.service.js";

// Mecánica de la cadena de responsables (tabla `asignacion`), compartida por derivarOt,
// derivarTicket y tomarTicket. Antes de la Fase 3, ot.derivacion.service.ts tenía 'ot' escrito a
// mano en el SQL (cerrar el tramo abierto, abrir uno nuevo): esta función generaliza exactamente
// esa parte, parametrizada por entidad_tipo. Lo que NO generaliza a propósito:
//   - actualizar responsable_actual_id de la entidad: cada entidad es un repositorio TypeORM
//     tipado distinto (Ot vs Ticket) y su propio `m.save()` dispara ActualizadoEnSubscriber; el
//     llamador lo hace con la entidad ya cargada que necesitaba de todos modos para sus propias
//     validaciones (usuarioAsignable, políticas, etc.).
//   - el evento: el payload y hasta el conjunto de tipos difieren por entidad (OT tiene
//     mantuvoComoColaborador porque hay colaboradores; ticket tiene un tipo 'tomado' que OT no
//     tiene) y cada uno se valida contra su propio discriminatedUnion en evento.service.ts.

export interface MoverTramoInput {
  entidadTipo: EntidadAsignable;
  entidadId: string;
  destinoId: string;
  // null en "tomar" (nadie se lo entregó, se lo tomó solo).
  motivoEntrada: string | null;
  derivadoPorId: string | null;
}

// Cierra el tramo abierto (si existe) y abre uno nuevo para destinoId. hasta > desde es un CHECK
// de la BD: si la operación cae en el mismo milisegundo que el inicio del tramo abierto, se
// avanza 1 ms (igual que hacía ot.derivacion.service.ts antes de esta generalización). Debe
// llamarse con la fila de la entidad ya bloqueada (UPDLOCK) por el llamador.
export async function moverTramoResponsable(manager: ManagerTransaccional, input: MoverTramoInput): Promise<void> {
  const { entidadTipo, entidadId, destinoId, motivoEntrada, derivadoPorId } = input;

  const [abierto] = (await manager.query(
    `SELECT id, desde FROM asignacion WHERE entidad_tipo = @0 AND entidad_id = @1 AND hasta IS NULL`,
    [entidadTipo, entidadId],
  )) as Array<{ id: string; desde: Date }>;

  let ahora = await ahoraDb(manager);
  if (abierto && ahora.getTime() <= abierto.desde.getTime()) ahora = new Date(abierto.desde.getTime() + 1);
  const ahoraIso = ahora.toISOString();

  if (abierto) {
    await manager.query(`UPDATE asignacion SET hasta = CAST(@0 AS datetimeoffset(3)) WHERE id = @1`, [ahoraIso, abierto.id]);
  }
  await manager.query(
    `INSERT INTO asignacion (id, entidad_tipo, entidad_id, usuario_id, desde, motivo_entrada, derivado_por_id)
     VALUES (@0, @1, @2, @3, CAST(@4 AS datetimeoffset(3)), @5, @6)`,
    [randomUUID(), entidadTipo, entidadId, destinoId, ahoraIso, motivoEntrada, derivadoPorId],
  );
}

// Notificación de derivación (no aplica a "tomar": ahí el actor es su propio destino). El API de
// lectura de notificaciones llega en la Fase 4; aquí solo se registra la fila (mismo criterio que
// ya usaba ot.derivacion.service.ts).
export async function notificarDerivacion(
  manager: ManagerTransaccional,
  destinoId: string,
  entidadTipo: EntidadAsignable,
  entidadId: string,
  titulo: string,
  cuerpo: string,
): Promise<void> {
  await manager.insert(Notificacion, { usuarioId: destinoId, tipo: "derivacion", entidadTipo, entidadId, titulo, cuerpo });
}
