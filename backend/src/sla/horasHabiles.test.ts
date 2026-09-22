import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { horasHabilesEntre, sumarHorasHabiles, ZONA_HORARIA_SLA, type FilaCalendario } from "./horasHabiles.js";

// Prioridad #1 de la Fase 4 (docs/backend-diseno.md sección 3 y el encargo): sumarHorasHabiles es
// el corazón del sistema de SLA. Calendario de prueba = la semilla real (lun-vie 09:00-18:30).
const CALENDARIO: FilaCalendario[] = [1, 2, 3, 4, 5].map((diaSemana) => ({
  diaSemana,
  horaInicio: "09:00:00",
  horaFin: "18:30:00",
}));

const SIN_FERIADOS = new Set<string>();

// Semana de referencia para los casos "normales": 2026-07-06 (lunes) a 2026-07-12 (domingo).
// Julio queda lejos de ambos cambios de horario de verano de Chile en 2026 (2026-04-04/05 y
// 2026-09-05/06), así que todo el año queda en GMT-04:00 sin ambigüedad; los casos que SÍ prueban
// el cruce de DST usan sus propias fechas de abril/septiembre más abajo.

function dt(iso: string): DateTime {
  // Instante expresado directamente en hora de Chile (offset explícito) para que el test sea
  // inequívoco sobre qué hora de pared se está probando.
  return DateTime.fromISO(iso, { zone: ZONA_HORARIA_SLA });
}

// Compara instantes por su ISO en la zona de Chile (hora de pared), no por epoch: así un fallo de
// aserción muestra directamente "esperaba 2026-07-10 10:30 y llegó 2026-07-10 09:30", útil para
// depurar un desfase de una hora si algún día alguien reintroduce aritmética de milisegundos cruda.
function iso(d: DateTime): string {
  return d.setZone(ZONA_HORARIA_SLA).toISO({ suppressMilliseconds: true }) ?? "";
}

describe("sumarHorasHabiles", () => {
  it("inicio dentro de horario: suma horas dentro del mismo día", () => {
    // Miércoles 2026-07-08 10:00 + 2h = 12:00 (mismo día, sin tocar el borde de la ventana).
    const r = sumarHorasHabiles(dt("2026-07-08T10:00:00"), 2, CALENDARIO, SIN_FERIADOS, ZONA_HORARIA_SLA);
    expect(iso(r)).toBe("2026-07-08T12:00:00-04:00");
  });

  it("inicio antes de que abra: arranca desde la apertura del mismo día", () => {
    // Miércoles 07:00 (antes de las 09:00) + 1h = 09:00 + 1h = 10:00.
    const r = sumarHorasHabiles(dt("2026-07-08T07:00:00"), 1, CALENDARIO, SIN_FERIADOS, ZONA_HORARIA_SLA);
    expect(iso(r)).toBe("2026-07-08T10:00:00-04:00");
  });

  it("inicio después de que cierra: arranca desde la apertura del día hábil siguiente", () => {
    // Miércoles 20:00 (después de las 18:30) + 1h = jueves 09:00 + 1h = 10:00.
    const r = sumarHorasHabiles(dt("2026-07-08T20:00:00"), 1, CALENDARIO, SIN_FERIADOS, ZONA_HORARIA_SLA);
    expect(iso(r)).toBe("2026-07-09T10:00:00-04:00");
  });

  it("inicio en fin de semana: arranca desde la apertura del lunes", () => {
    // Sábado 2026-07-11 12:00 + 1h = lunes 2026-07-13 09:00 + 1h = 10:00.
    const r = sumarHorasHabiles(dt("2026-07-11T12:00:00"), 1, CALENDARIO, SIN_FERIADOS, ZONA_HORARIA_SLA);
    expect(iso(r)).toBe("2026-07-13T10:00:00-04:00");
  });

  it("inicio en feriado: arranca desde la apertura del siguiente día hábil", () => {
    // Martes 2026-07-07 marcado feriado (fecha inventada para el test) + 1h = miércoles 09:00+1h.
    const feriados = new Set(["2026-07-07"]);
    const r = sumarHorasHabiles(dt("2026-07-07T11:00:00"), 1, CALENDARIO, feriados, ZONA_HORARIA_SLA);
    expect(iso(r)).toBe("2026-07-08T10:00:00-04:00");
  });

  it("tramo que cruza el fin de una jornada al inicio de la siguiente", () => {
    // Miércoles 17:00 + 3h: 1.5h hasta las 18:30, quedan 1.5h -> jueves 09:00 + 1.5h = 10:30.
    const r = sumarHorasHabiles(dt("2026-07-08T17:00:00"), 3, CALENDARIO, SIN_FERIADOS, ZONA_HORARIA_SLA);
    expect(iso(r)).toBe("2026-07-09T10:30:00-04:00");
  });

  it("tramo que cruza un fin de semana completo", () => {
    // Viernes 17:00 + 3h: 1.5h hasta las 18:30, quedan 1.5h -> lunes 09:00 + 1.5h = 10:30.
    const r = sumarHorasHabiles(dt("2026-07-10T17:00:00"), 3, CALENDARIO, SIN_FERIADOS, ZONA_HORARIA_SLA);
    expect(iso(r)).toBe("2026-07-13T10:30:00-04:00");
  });

  it("tramo que cruza un feriado en medio de la semana", () => {
    // Jueves 17:00 + 3h, con el viernes marcado feriado: 1.5h hasta las 18:30 del jueves, el
    // viernes se salta entero, quedan 1.5h -> lunes 09:00 + 1.5h = 10:30.
    const feriados = new Set(["2026-07-10"]); // viernes
    const r = sumarHorasHabiles(dt("2026-07-09T17:00:00"), 3, CALENDARIO, feriados, ZONA_HORARIA_SLA);
    expect(iso(r)).toBe("2026-07-13T10:30:00-04:00");
  });

  it("horas=0 con inicio dentro de horario: no avanza", () => {
    const r = sumarHorasHabiles(dt("2026-07-08T10:00:00"), 0, CALENDARIO, SIN_FERIADOS, ZONA_HORARIA_SLA);
    expect(iso(r)).toBe("2026-07-08T10:00:00-04:00");
  });

  it("horas=0 con inicio fuera de horario: solo encaja en el próximo instante hábil", () => {
    // Sábado + 0h = lunes 09:00 en punto (sin sumar nada más).
    const r = sumarHorasHabiles(dt("2026-07-11T12:00:00"), 0, CALENDARIO, SIN_FERIADOS, ZONA_HORARIA_SLA);
    expect(iso(r)).toBe("2026-07-13T09:00:00-04:00");
  });

  it("cruza el fin del horario de verano de Chile (2026-04-04/05, GMT-3 -> GMT-4)", () => {
    // Viernes 2026-04-03 17:00 (GMT-3, verano) + 3h: 1.5h hasta las 18:30, quedan 1.5h -> el fin
    // de semana atraviesa el cambio de horario -> lunes 2026-04-06 09:00 (ya GMT-4) + 1.5h = 10:30.
    // Si la función sumara milisegundos crudos en vez de aritmética de Luxon en la zona, el
    // resultado quedaría desfasado en 1 hora de pared (confirmado con un smoke test manual antes
    // de fijar este caso: el offset de salida cambia de -03:00 a -04:00 entre el viernes y el
    // lunes, y Luxon lo resuelve solo via .plus({days:1})/.set(...) en la zona).
    const r = sumarHorasHabiles(dt("2026-04-03T17:00:00"), 3, CALENDARIO, SIN_FERIADOS, ZONA_HORARIA_SLA);
    expect(iso(r)).toBe("2026-04-06T10:30:00-04:00");
  });

  it("cruza el inicio del horario de verano de Chile (2026-09-05/06, GMT-4 -> GMT-3)", () => {
    // Viernes 2026-09-04 17:00 (GMT-4, invierno) + 3h: 1.5h hasta las 18:30, quedan 1.5h -> el fin
    // de semana atraviesa el cambio -> lunes 2026-09-07 09:00 (ya GMT-3) + 1.5h = 10:30.
    const r = sumarHorasHabiles(dt("2026-09-04T17:00:00"), 3, CALENDARIO, SIN_FERIADOS, ZONA_HORARIA_SLA);
    expect(iso(r)).toBe("2026-09-07T10:30:00-03:00");
  });

  it("un tramo largo puede acumular varios días completos", () => {
    // Lunes 09:00 + 20h: cada día hábil aporta 9.5h (09:00-18:30). 20h = 9.5+9.5+1h ->
    // lunes completo, martes completo, miércoles 09:00+1h = 10:00.
    const r = sumarHorasHabiles(dt("2026-07-06T09:00:00"), 20, CALENDARIO, SIN_FERIADOS, ZONA_HORARIA_SLA);
    expect(iso(r)).toBe("2026-07-08T10:00:00-04:00");
  });

  it("el plazo exacto hasta el cierre deja el resultado justo en la hora de cierre", () => {
    // Miércoles 09:00 + 9.5h = exactamente 18:30 del mismo día.
    const r = sumarHorasHabiles(dt("2026-07-08T09:00:00"), 9.5, CALENDARIO, SIN_FERIADOS, ZONA_HORARIA_SLA);
    expect(iso(r)).toBe("2026-07-08T18:30:00-04:00");
  });
});

describe("horasHabilesEntre", () => {
  it("mismo día, ambos dentro de horario", () => {
    const h = horasHabilesEntre(dt("2026-07-08T10:00:00"), dt("2026-07-08T12:30:00"), CALENDARIO, SIN_FERIADOS, ZONA_HORARIA_SLA);
    expect(h).toBeCloseTo(2.5, 6);
  });

  it("fin <= inicio: 0", () => {
    const h = horasHabilesEntre(dt("2026-07-08T12:00:00"), dt("2026-07-08T10:00:00"), CALENDARIO, SIN_FERIADOS, ZONA_HORARIA_SLA);
    expect(h).toBe(0);
  });

  it("cruzando un fin de semana: solo cuenta las horas hábiles de cada lado", () => {
    // Viernes 17:00 a lunes 10:30: 1.5h (viernes) + 1.5h (lunes) = 3h.
    const h = horasHabilesEntre(dt("2026-07-10T17:00:00"), dt("2026-07-13T10:30:00"), CALENDARIO, SIN_FERIADOS, ZONA_HORARIA_SLA);
    expect(h).toBeCloseTo(3, 6);
  });

  it("es la inversa de sumarHorasHabiles para un tramo cualquiera", () => {
    const inicio = dt("2026-07-08T14:00:00");
    const vencimiento = sumarHorasHabiles(inicio, 7.25, CALENDARIO, SIN_FERIADOS, ZONA_HORARIA_SLA);
    const h = horasHabilesEntre(inicio, vencimiento, CALENDARIO, SIN_FERIADOS, ZONA_HORARIA_SLA);
    expect(h).toBeCloseTo(7.25, 6);
  });

  it("también cruza correctamente el horario de verano", () => {
    // Mismo tramo del caso de sumarHorasHabiles que cruza el fin del DST: debe medir 3h exactas.
    const h = horasHabilesEntre(dt("2026-04-03T17:00:00"), dt("2026-04-06T10:30:00"), CALENDARIO, SIN_FERIADOS, ZONA_HORARIA_SLA);
    expect(h).toBeCloseTo(3, 6);
  });
});
