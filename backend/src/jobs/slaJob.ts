import { AppDataSource } from "../config/dataSource.js";
import { SlaConfig } from "../entities/SlaConfig.js";
import { EntidadAsignable, type Prioridad, type SlaEstado } from "../entities/enums.js";
import { ahoraDb } from "../services/ot.common.js";
import { enTransaccion } from "../services/folio.service.js";
import { notificarSla } from "../services/notificacion.service.js";
import { cargarCalendarioYFeriados, calcularEstadoSla } from "../services/sla.calculo.service.js";

// evaluarSla(): invocable directamente (los tests la llaman sin esperar un cron; api/worker.ts la
// programa cada 5 min con node-cron). Recorre OT y tickets NO terminales con vencimiento no nulo,
// recalcula sla_estado y, si cambió, lo actualiza y notifica al responsable actual — pero SOLO en
// la transición hacia por_vencer o vencida (una des-escalada, p. ej. tras subir el plazo en
// PUT /sla/config, actualiza el estado igual pero no genera notificación: ver docs/backend-diseno.md).
//
// Entidades con sla_pausado_desde IS NOT NULL (ticket en esperando_cliente con la pausa activa) se
// excluyen a propósito: la pausa congela el reloj del SLA, así que también congela su evaluación
// -- si no, el job las marcaría vencida mientras están pausadas, contradiciendo el propósito de
// pausar (decisión documentada en docs/backend-diseno.md, no está en el encargo palabra por
// palabra pero se sigue directamente de "el SLA se pausa").
//
// Idempotente por construcción: si sla_estado ya es el valor calculado, no hay UPDATE ni
// notificación (correrla dos veces seguidas sin que pase el tiempo no cambia nada).

interface FilaOtJob {
  id: string;
  numero: string;
  prioridad: Prioridad;
  sla_estado: SlaEstado;
  sla_resolucion_vence_en: Date;
  responsable_actual_id: string | null;
}

interface FilaTicketJob {
  id: string;
  numero: string;
  prioridad: Prioridad;
  sla_estado: SlaEstado;
  sla_resolucion_vence_en: Date | null;
  sla_respuesta_vence_en: Date | null;
  primera_respuesta_en: Date | null;
  responsable_actual_id: string | null;
}

export async function evaluarSla(): Promise<void> {
  await enTransaccion(AppDataSource, async (m) => {
    const ahora = await ahoraDb(m);
    const cal = await cargarCalendarioYFeriados(m);
    const configs = await m.find(SlaConfig);
    const cfgPorPrioridad = new Map(configs.map((c) => [c.prioridad, c]));

    const ots: FilaOtJob[] = await m.query(`
      SELECT id, numero, prioridad, sla_estado, sla_resolucion_vence_en, responsable_actual_id
      FROM ot
      WHERE estado NOT IN ('terminado','facturado')
        AND sla_resolucion_vence_en IS NOT NULL
        AND sla_pausado_desde IS NULL
    `);
    for (const ot of ots) {
      const cfg = cfgPorPrioridad.get(ot.prioridad);
      if (!cfg) continue;
      const nuevo = calcularEstadoSla(ahora, ot.sla_resolucion_vence_en, cfg.horasResolucion, cfg.umbralPorVencer, cal);
      if (nuevo === ot.sla_estado) continue;

      await m.query(`UPDATE ot SET sla_estado = @0 WHERE id = @1`, [nuevo, ot.id]);
      if ((nuevo === "por_vencer" || nuevo === "vencida") && ot.responsable_actual_id) {
        await notificarSla(m, ot.responsable_actual_id, EntidadAsignable.OT, ot.id, ot.numero, nuevo);
      }
    }

    const tickets: FilaTicketJob[] = await m.query(`
      SELECT id, numero, prioridad, sla_estado, sla_resolucion_vence_en, sla_respuesta_vence_en,
             primera_respuesta_en, responsable_actual_id
      FROM ticket
      WHERE estado NOT IN ('resuelto','cerrado')
        AND (sla_resolucion_vence_en IS NOT NULL OR sla_respuesta_vence_en IS NOT NULL)
        AND sla_pausado_desde IS NULL
    `);
    for (const t of tickets) {
      const cfg = cfgPorPrioridad.get(t.prioridad);
      if (!cfg) continue;

      // Antes de la primera respuesta: fase "primera respuesta". Después: fase "resolución".
      const enFaseRespuesta = t.primera_respuesta_en === null;
      const vigente = enFaseRespuesta ? t.sla_respuesta_vence_en : t.sla_resolucion_vence_en;
      if (vigente === null) continue;
      const horasPlazo = enFaseRespuesta ? cfg.horasPrimeraRespuesta : cfg.horasResolucion;

      const nuevo = calcularEstadoSla(ahora, vigente, horasPlazo, cfg.umbralPorVencer, cal);
      if (nuevo === t.sla_estado) continue;

      await m.query(`UPDATE ticket SET sla_estado = @0 WHERE id = @1`, [nuevo, t.id]);
      if ((nuevo === "por_vencer" || nuevo === "vencida") && t.responsable_actual_id) {
        await notificarSla(m, t.responsable_actual_id, EntidadAsignable.TICKET, t.id, t.numero, nuevo);
      }
    }
  });
}
