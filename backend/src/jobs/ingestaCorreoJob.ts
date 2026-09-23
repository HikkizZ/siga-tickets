import { AppDataSource } from "../config/dataSource.js";
import { logger } from "../config/logger.js";
import { MailboxCursor } from "../entities/MailboxCursor.js";
import { crearMailboxSource } from "../mail/ingest/index.js";
import type { MailboxSource } from "../mail/ingest/MailboxSource.js";
import { procesarMensajeEntrante } from "../services/correoIngerido.service.js";

// Fase 6: ingesta de correo. Invocable directo (los tests inyectan una MailboxSource falsa), igual
// que evaluarSla/procesarCorreoSaliente; api/worker.ts la programa con node-cron.
//
// Criterio de consistencia del cursor (punto 2 del encargo): cada mensaje ya se registra de forma
// durable e idempotente en correo_ingerido dentro de procesarMensajeEntrante (su propio INSERT,
// confirmado antes de tocar cualquier ticket — ver services/correoIngerido.service.ts). El cursor
// de mailbox_cursor se actualiza recién DESPUÉS de intentar procesar TODOS los mensajes del lote
// devuelto por fetchNuevos, en un único UPSERT. Si el proceso muere a mitad del lote, el cursor
// guardado queda en el valor anterior: la próxima pasada vuelve a pedir el mismo rango a la
// MailboxSource y reencuentra mensajes ya insertados en correo_ingerido (procesados O en error);
// la idempotencia de messageId (UNIQUE + violacionUnica) los salta sin duplicar nada. Así el
// cursor nunca "avanza" más allá de lo que ya quedó durablemente registrado, sin necesitar que la
// actualización del cursor y el procesamiento de cada mensaje compartan una única transacción
// (cada mensaje ya tiene la suya, ver el encargo: "cada mensaje en su propia transacción").
async function leerCursor(origen: string): Promise<string | null> {
  const fila = await AppDataSource.getRepository(MailboxCursor).findOne({ where: { origen } });
  return fila?.cursor ?? null;
}

async function guardarCursor(origen: string, cursor: string): Promise<void> {
  // [cursor] entre corchetes: CURSOR es palabra reservada de T-SQL (DECLARE CURSOR).
  await AppDataSource.query(
    `MERGE mailbox_cursor AS destino
     USING (SELECT @0 AS origen) AS nuevo
     ON destino.origen = nuevo.origen
     WHEN MATCHED THEN UPDATE SET [cursor] = @1, actualizado_en = SYSDATETIMEOFFSET()
     WHEN NOT MATCHED THEN INSERT (origen, [cursor], actualizado_en) VALUES (@0, @1, SYSDATETIMEOFFSET());`,
    [origen, cursor],
  );
}

// Sin source explícito (producción, nunca en tests): la config del buzón vive en BD y puede cambiar
// en caliente (Fase A), así que se resuelve DE NUEVO en cada corrida vía crearMailboxSource(), no
// una vez al importar el módulo.
export async function procesarIngesta(sourceParam?: MailboxSource): Promise<void> {
  const source = sourceParam ?? (await crearMailboxSource()).source;
  const origen = source.nombre();
  const cursorGuardado = await leerCursor(origen);
  const { mensajes, cursor: cursorNuevo } = await source.fetchNuevos(cursorGuardado);

  for (const correo of mensajes) {
    try {
      await procesarMensajeEntrante(correo, origen);
    } catch (err) {
      // procesarMensajeEntrante ya atrapa los errores esperables del propio correo (quedan en
      // 'error' en correo_ingerido); esto solo cubre el caso defensivo de un fallo antes de poder
      // dejar constancia (ver el criterio documentado en correoIngerido.service.ts). Un mensaje que
      // falla nunca debe tumbar el resto del lote.
      logger.error({ err, messageId: correo.messageId }, "procesarMensajeEntrante falló; se continúa con el resto del lote");
    }
  }

  await guardarCursor(origen, cursorNuevo);
}
