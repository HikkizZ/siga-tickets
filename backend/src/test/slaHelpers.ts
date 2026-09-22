import { AppDataSource } from "../config/dataSource.js";
import type { CalendarioYFeriados } from "../services/sla.calculo.service.js";

// Carga el calendario/feriados reales de la BD de test, igual que hace
// sla.calculo.service.ts::cargarCalendarioYFeriados, para que los tests de integración puedan
// recomputar de forma independiente (con la función pura ya probada en src/sla/horasHabiles.test.ts)
// el vencimiento esperado y compararlo contra lo que devolvió la API.
export async function calendarioYFeriadosReales(): Promise<CalendarioYFeriados> {
  const filasCalendario: Array<{ dia_semana: number; hora_inicio: string; hora_fin: string }> = await AppDataSource.query(
    `SELECT dia_semana, CONVERT(varchar(8), hora_inicio, 108) AS hora_inicio, CONVERT(varchar(8), hora_fin, 108) AS hora_fin
     FROM calendario_laboral`,
  );
  const filasFeriado: Array<{ fecha: string }> = await AppDataSource.query(`SELECT CONVERT(varchar(10), fecha, 23) AS fecha FROM feriado`);
  return {
    calendario: filasCalendario.map((f) => ({ diaSemana: f.dia_semana, horaInicio: f.hora_inicio, horaFin: f.hora_fin })),
    feriados: new Set(filasFeriado.map((f) => f.fecha)),
  };
}
