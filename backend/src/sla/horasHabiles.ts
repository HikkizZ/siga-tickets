import { DateTime } from "luxon";

// Corazón del sistema de SLA (Fase 4). Funciones PURAS: sin BD, sin I/O, sin `new Date()`.
// Reciben el calendario y los feriados ya cargados y devuelven/miden tiempo con aritmética de
// Luxon en la zona (nunca sumando milisegundos a mano), porque America/Santiago tiene horario de
// verano: sumar ms directamente desfasaría la hora de pared al cruzar un cambio de DST.

export const ZONA_HORARIA_SLA = "America/Santiago";

// Espejo de calendario_laboral: dia_semana 1=lunes...7=domingo (ISO, igual que DateTime#weekday).
// hora_inicio/hora_fin en formato "HH:MM:SS" (o "HH:MM"): quien carga desde la BD normaliza con
// CONVERT(varchar, ..., 108) antes de llegar aquí, así esta función no depende del driver.
export interface FilaCalendario {
  diaSemana: number;
  horaInicio: string;
  horaFin: string;
}

interface Ventana {
  inicio: DateTime;
  fin: DateTime;
}

function parseHora(hhmmss: string): { h: number; m: number; s: number } {
  const [h, m, s] = hhmmss.split(":").map(Number);
  return { h: h ?? 0, m: m ?? 0, s: s ?? 0 };
}

// Ventana laboral del día de `fecha` (mismo día calendario, en su zona), o null si ese día de la
// semana no tiene fila en el calendario (p. ej. sábado/domingo con la semilla lun-vie).
function ventanaDelDia(fecha: DateTime, calendario: FilaCalendario[]): Ventana | null {
  const fila = calendario.find((f) => f.diaSemana === fecha.weekday);
  if (!fila) return null;
  const hi = parseHora(fila.horaInicio);
  const hf = parseHora(fila.horaFin);
  return {
    inicio: fecha.set({ hour: hi.h, minute: hi.m, second: hi.s, millisecond: 0 }),
    fin: fecha.set({ hour: hf.h, minute: hf.m, second: hf.s, millisecond: 0 }),
  };
}

function esFeriado(fecha: DateTime, feriados: Set<string>): boolean {
  return feriados.has(fecha.toISODate() ?? "");
}

// Tope de días a recorrer buscando el próximo instante/tramo hábil: protege contra un calendario
// mal cargado (sin ninguna fila) sin dejar un loop infinito. ~5 años cubre cualquier caso real.
const MAX_DIAS = 2000;

// Primer instante hábil >= `instante`: salta fines de semana (día sin fila en el calendario),
// feriados completos, y el tramo fuera de horario del propio día (antes de abrir o después de
// cerrar). Si `instante` ya cae dentro de una ventana laboral, se devuelve tal cual.
function siguienteInstanteHabil(instante: DateTime, calendario: FilaCalendario[], feriados: Set<string>): DateTime {
  let cursor = instante;
  for (let i = 0; i < MAX_DIAS; i++) {
    if (esFeriado(cursor, feriados)) {
      cursor = cursor.plus({ days: 1 }).startOf("day");
      continue;
    }
    const ventana = ventanaDelDia(cursor, calendario);
    if (!ventana) {
      cursor = cursor.plus({ days: 1 }).startOf("day");
      continue;
    }
    if (cursor < ventana.inicio) return ventana.inicio;
    if (cursor >= ventana.fin) {
      cursor = cursor.plus({ days: 1 }).startOf("day");
      continue;
    }
    return cursor; // ya está dentro de la ventana
  }
  throw new Error("sumarHorasHabiles: no se encontró un instante hábil (¿calendario sin filas?)");
}

// Avanza `horas` horas de trabajo desde `inicio`, saltando fuera de la ventana de
// calendario_laboral y los feriados completos (comparando la fecha ya en `zona`, no en UTC: un
// instante puede caer en un día distinto según la zona). horas <= 0 no avanza nada: solo "encaja"
// `inicio` en el próximo instante hábil (si ya estaba en horario, se devuelve sin cambios).
export function sumarHorasHabiles(
  inicio: DateTime,
  horas: number,
  calendario: FilaCalendario[],
  feriados: Set<string>,
  zona: string,
): DateTime {
  let cursor = siguienteInstanteHabil(inicio.setZone(zona), calendario, feriados);
  let restanteMs = horas * 3_600_000;
  if (restanteMs <= 0) return cursor;

  for (let i = 0; i < MAX_DIAS; i++) {
    const ventana = ventanaDelDia(cursor, calendario);
    if (!ventana) {
      // No debería pasar (cursor siempre queda dentro de una ventana al final de cada vuelta),
      // pero por robustez: salta al próximo instante hábil como si hubiera terminado el día.
      cursor = siguienteInstanteHabil(cursor.plus({ days: 1 }).startOf("day"), calendario, feriados);
      continue;
    }
    const disponibleMs = ventana.fin.diff(cursor).as("milliseconds");
    if (restanteMs <= disponibleMs) {
      return cursor.plus({ milliseconds: restanteMs });
    }
    restanteMs -= disponibleMs;
    cursor = siguienteInstanteHabil(cursor.plus({ days: 1 }).startOf("day"), calendario, feriados);
  }
  throw new Error("sumarHorasHabiles: no convergió (¿calendario sin horas hábiles?)");
}

// Complemento de sumarHorasHabiles: horas hábiles transcurridas entre dos instantes (`fin` puede
// caer fuera de horario; se cuenta solo lo que efectivamente es horario laboral). 0 si fin <= inicio.
// La usan el job (minutos hábiles restantes hasta el vencimiento) y el cierre de una pausa de SLA
// (minutos hábiles que duró la pausa), ambos descritos en el encargo de la Fase 4 sin nombrar esta
// función explícitamente: es la forma natural de medir "horas hábiles entre dos instantes" con la
// misma lógica de ventana/feriado que sumarHorasHabiles, en vez de reimplementarla dos veces.
export function horasHabilesEntre(
  inicio: DateTime,
  fin: DateTime,
  calendario: FilaCalendario[],
  feriados: Set<string>,
  zona: string,
): number {
  const a = inicio.setZone(zona);
  const b = fin.setZone(zona);
  if (b <= a) return 0;

  let totalMs = 0;
  let cursor = a;
  for (let i = 0; i < MAX_DIAS; i++) {
    if (cursor >= b) break;
    if (esFeriado(cursor, feriados)) {
      cursor = cursor.plus({ days: 1 }).startOf("day");
      continue;
    }
    const ventana = ventanaDelDia(cursor, calendario);
    if (!ventana) {
      cursor = cursor.plus({ days: 1 }).startOf("day");
      continue;
    }
    const desde = cursor > ventana.inicio ? cursor : ventana.inicio;
    const hasta = ventana.fin < b ? ventana.fin : b;
    if (desde < hasta) totalMs += hasta.diff(desde).as("milliseconds");
    cursor = cursor.plus({ days: 1 }).startOf("day");
  }
  return totalMs / 3_600_000;
}
