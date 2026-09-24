import { AppDataSource } from "../config/dataSource.js";
import { EntidadAsignable, type SlaEstado } from "../entities/enums.js";
import { ahoraDb } from "../services/ot.common.js";
import { enTransaccion } from "../services/folio.service.js";
import { notificarSla } from "../services/notificacion.service.js";
import { cargarCalendarioYFeriados, calcularEstadoSla } from "../services/sla.calculo.service.js";

// evaluarSla(): invocable directamente (los tests la llaman sin esperar un cron; api/worker.ts la
// programa cada 5 min con node-cron). Recorre OT y tickets NO terminales con vencimiento no nulo,
// recalcula sla_estado y, si cambió, lo actualiza y notifica al responsable actual — pero SOLO en
// la transición hacia por_vencer o vencida (una des-escalada, p. ej. tras subir el plazo de un plan
// SLA, actualiza el estado igual pero no genera notificación: ver docs/backend-diseno.md).
//
// Entidades con sla_pausado_desde IS NOT NULL (ticket en un estado con esPausaSla=true, con la
// pausa activa) se excluyen a propósito: la pausa congela el reloj del SLA, así que también
// congela su evaluación -- si no, el job las marcaría vencida mientras están pausadas, contradiciendo
// el propósito de pausar (decisión documentada en docs/backend-diseno.md).
//
// Idempotente por construcción: si sla_estado ya es el valor calculado, no hay UPDATE ni
// notificación (correrla dos veces seguidas sin que pase el tiempo no cambia nada).
//
// Fase C: sla_config se retira. cfgPorPrioridad ahora sale de un JOIN prioridad + plan_sla
// (prioridades sin plan asignado quedan fuera del mapa, igual que antes cuando faltaba la fila). El
// filtro de tickets "no terminal" pasa de `estado NOT IN (...)` a estado_ticket.es_terminal = 0; el
// de OT no cambia (EstadoOt sigue fijo, fuera de alcance de esta fase).

interface FilaOtJob {
  id: string;
  numero: string;
  prioridad_id: string;
  sla_estado: SlaEstado;
  sla_resolucion_vence_en: Date;
  responsable_actual_id: string | null;
}

interface FilaTicketJob {
  id: string;
  numero: string;
  prioridad_id: string;
  sla_estado: SlaEstado;
  sla_resolucion_vence_en: Date | null;
  sla_respuesta_vence_en: Date | null;
  primera_respuesta_en: Date | null;
  responsable_actual_id: string | null;
}

interface FilaConfigPrioridad {
  prioridad_id: string;
  horas_resolucion: number;
  horas_primera_respuesta: number;
  umbral_por_vencer: string;
}

export async function evaluarSla(): Promise<void> {
  await enTransaccion(AppDataSource, async (m) => {
    const ahora = await ahoraDb(m);
    const cal = await cargarCalendarioYFeriados(m);
    const configs: FilaConfigPrioridad[] = await m.query(`
      SELECT p.id AS prioridad_id, ps.horas_resolucion, ps.horas_primera_respuesta, ps.umbral_por_vencer
      FROM prioridad p JOIN plan_sla ps ON ps.id = p.plan_sla_id
    `);
    const cfgPorPrioridad = new Map(
      configs.map((c) => [
        c.prioridad_id,
        { horasResolucion: c.horas_resolucion, horasPrimeraRespuesta: c.horas_primera_respuesta, umbralPorVencer: Number(c.umbral_por_vencer) },
      ]),
    );

    const ots: FilaOtJob[] = await m.query(`
      SELECT id, numero, prioridad_id, sla_estado, sla_resolucion_vence_en, responsable_actual_id
      FROM ot
      WHERE estado NOT IN ('terminado','facturado')
        AND sla_resolucion_vence_en IS NOT NULL
        AND sla_pausado_desde IS NULL
    `);
    for (const ot of ots) {
      const cfg = cfgPorPrioridad.get(ot.prioridad_id);
      if (!cfg) continue;
      const nuevo = calcularEstadoSla(ahora, ot.sla_resolucion_vence_en, cfg.horasResolucion, cfg.umbralPorVencer, cal);
      if (nuevo === ot.sla_estado) continue;

      await m.query(`UPDATE ot SET sla_estado = @0 WHERE id = @1`, [nuevo, ot.id]);
      if ((nuevo === "por_vencer" || nuevo === "vencida") && ot.responsable_actual_id) {
        await notificarSla(m, ot.responsable_actual_id, EntidadAsignable.OT, ot.id, ot.numero, nuevo);
      }
    }

    const tickets: FilaTicketJob[] = await m.query(`
      SELECT t.id, t.numero, t.prioridad_id, t.sla_estado, t.sla_resolucion_vence_en, t.sla_respuesta_vence_en,
             t.primera_respuesta_en, t.responsable_actual_id
      FROM ticket t
      JOIN estado_ticket e ON e.id = t.estado_id
      WHERE e.es_terminal = 0
        AND (t.sla_resolucion_vence_en IS NOT NULL OR t.sla_respuesta_vence_en IS NOT NULL)
        AND t.sla_pausado_desde IS NULL
    `);
    for (const t of tickets) {
      const cfg = cfgPorPrioridad.get(t.prioridad_id);
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
