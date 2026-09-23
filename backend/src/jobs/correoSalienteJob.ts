import { AppDataSource } from "../config/dataSource.js";
import { CorreoSaliente } from "../entities/CorreoSaliente.js";
import { crearMailer } from "../mail/outbound/index.js";
import type { Mailer } from "../mail/outbound/Mailer.js";
import { enTransaccion } from "../services/folio.service.js";
import { notificarCorreoFallido } from "../services/notificacion.service.js";

const MAX_INTENTOS = 5;

// Toma UNA fila pendiente y vencida con WITH (UPDLOCK, READPAST, ROWLOCK) — equivalente de
// FOR UPDATE SKIP LOCKED (docs/backend-diseno.md 2.5) — y la marca 'enviando' en la misma
// transacción corta, que se cierra de inmediato (así el envío real, que es E/S de red, nunca
// ocurre con un lock de fila abierto). Aunque hoy solo corre un worker, el hint asegura que dos
// procesos nunca tomen la misma fila.
async function tomarPendiente(): Promise<CorreoSaliente | null> {
  return enTransaccion(AppDataSource, async (m) => {
    const filas: Array<{ id: string }> = await m.query(`
      SELECT TOP 1 id FROM correo_saliente WITH (UPDLOCK, READPAST, ROWLOCK)
      WHERE estado = 'pendiente' AND proximo_intento_en <= SYSDATETIMEOFFSET()
      ORDER BY proximo_intento_en ASC
    `);
    const id = filas[0]?.id;
    if (!id) return null;
    await m.query(`UPDATE correo_saliente SET estado = 'enviando', actualizado_en = SYSDATETIMEOFFSET() WHERE id = @0`, [id]);
    return m.findOne(CorreoSaliente, { where: { id } });
  });
}

// Éxito: pasa a 'enviado'. Falla: incrementa intentos; al llegar a MAX_INTENTOS pasa a 'fallido' y
// notifica a los admin (in-app); si no, vuelve a 'pendiente' con backoff 2^intentos minutos.
async function marcarResultado(id: string, intentosPrevios: number, error: string | null): Promise<void> {
  await enTransaccion(AppDataSource, async (m) => {
    if (error === null) {
      await m.query(`UPDATE correo_saliente SET estado = 'enviado', actualizado_en = SYSDATETIMEOFFSET(), error = NULL WHERE id = @0`, [id]);
      return;
    }

    const intentos = intentosPrevios + 1;
    if (intentos >= MAX_INTENTOS) {
      const correo = await m.findOneOrFail(CorreoSaliente, { where: { id } });
      await m.query(
        `UPDATE correo_saliente SET estado = 'fallido', intentos = @1, error = @2, actualizado_en = SYSDATETIMEOFFSET() WHERE id = @0`,
        [id, intentos, error],
      );
      await notificarCorreoFallido(m, id, correo.para, correo.asunto);
    } else {
      const backoffMin = 2 ** intentos;
      await m.query(
        `UPDATE correo_saliente
         SET estado = 'pendiente', intentos = @1, error = @2,
             proximo_intento_en = DATEADD(MINUTE, @3, SYSDATETIMEOFFSET()), actualizado_en = SYSDATETIMEOFFSET()
         WHERE id = @0`,
        [id, intentos, error, backoffMin],
      );
    }
  });
}

// Invocable directo (los tests inyectan un Mailer falso), igual que evaluarSla; api/worker.ts la
// programa cada 30 s con node-cron. Procesa TODAS las filas actualmente vencidas en una pasada, una
// por una (cada una con su propia transacción corta de toma + su propia transacción de resultado).
//
// Sin mailer explícito (producción, nunca en tests): la config del buzón vive en BD y puede cambiar
// en caliente (Fase A), así que se resuelve DE NUEVO en cada corrida vía crearMailer(), no una vez
// al importar el módulo.
export async function procesarCorreoSaliente(mailerParam?: Mailer): Promise<void> {
  const mailer = mailerParam ?? (await crearMailer()).mailer;
  for (;;) {
    const correo = await tomarPendiente();
    if (!correo) return;

    try {
      await mailer.enviar({ para: correo.para, asunto: correo.asunto, cuerpoHtml: correo.cuerpoHtml, headers: correo.headers });
      await marcarResultado(correo.id, correo.intentos, null);
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : String(err);
      await marcarResultado(correo.id, correo.intentos, mensaje);
    }
  }
}
