import { DateTime } from "luxon";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { sumarHorasHabiles, ZONA_HORARIA_SLA } from "../sla/horasHabiles.js";
import { conectarBD, limpiarBD } from "../test/helpers.js";
import { API, crearClienteTest, crearOtApi, crearSesionNombrada } from "../test/otHelpers.js";
import { calendarioYFeriadosReales } from "../test/slaHelpers.js";
import { Rol } from "../entities/enums.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

// Horas de resolución de la semilla de sla_config (docs/backend-diseno.md sección 2.3).
const HORAS_RESOLUCION: Record<string, number> = { alta: 24, media: 72, baja: 120 };

async function detalleOt(auth: string, id: string) {
  const res = await request(app).get(`${API}/ots/${id}`).set("Authorization", auth);
  if (res.status !== 200) throw new Error(`detalleOt falló: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data as { fechaIngreso: string; slaResolucionVenceEn: string | null; prioridad: string };
}

describe("SLA al crear/editar una OT (Fase 4)", () => {
  it.each(["alta", "media", "baja"] as const)("calcula slaResolucionVenceEn con las horas hábiles de la prioridad %s", async (prioridad) => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_ot_sla");
    const cliente = await crearClienteTest();
    const ot = await crearOtApi(admin.auth, cliente.id, { prioridad });

    const detalle = await detalleOt(admin.auth, ot.id);
    expect(detalle.slaResolucionVenceEn).not.toBeNull();

    const { calendario, feriados } = await calendarioYFeriadosReales();
    const esperado = sumarHorasHabiles(
      DateTime.fromJSDate(new Date(detalle.fechaIngreso), { zone: "utc" }),
      HORAS_RESOLUCION[prioridad]!,
      calendario,
      feriados,
      ZONA_HORARIA_SLA,
    ).toJSDate();

    expect(new Date(detalle.slaResolucionVenceEn!).getTime()).toBe(esperado.getTime());
  });

  it("cambiar la prioridad recalcula el vencimiento desde la fecha_ingreso ORIGINAL, no desde ahora", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_ot_sla2");
    const cliente = await crearClienteTest();
    const ot = await crearOtApi(admin.auth, cliente.id, { prioridad: "baja" });
    const antes = await detalleOt(admin.auth, ot.id);

    const res = await request(app).patch(`${API}/ots/${ot.id}`).set("Authorization", admin.auth).send({ prioridad: "alta" });
    expect(res.status).toBe(200);

    const { calendario, feriados } = await calendarioYFeriadosReales();
    // Se recalcula desde la fechaIngreso original (que no cambia con el PATCH), con la nueva prioridad.
    const esperado = sumarHorasHabiles(
      DateTime.fromJSDate(new Date(antes.fechaIngreso), { zone: "utc" }),
      HORAS_RESOLUCION.alta!,
      calendario,
      feriados,
      ZONA_HORARIA_SLA,
    ).toJSDate();

    expect(res.body.data.fechaIngreso).toBe(antes.fechaIngreso); // la fecha de ingreso no cambia
    expect(new Date(res.body.data.slaResolucionVenceEn).getTime()).toBe(esperado.getTime());
    // Y es distinto del vencimiento con la prioridad anterior (baja tiene un plazo mucho mayor).
    expect(res.body.data.slaResolucionVenceEn).not.toBe(antes.slaResolucionVenceEn);
  });

  it("no cambiar la prioridad no toca el vencimiento", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_ot_sla3");
    const cliente = await crearClienteTest();
    const ot = await crearOtApi(admin.auth, cliente.id, { prioridad: "media" });
    const antes = await detalleOt(admin.auth, ot.id);

    const res = await request(app).patch(`${API}/ots/${ot.id}`).set("Authorization", admin.auth).send({ titulo: "Nuevo título" });

    expect(res.status).toBe(200);
    expect(res.body.data.slaResolucionVenceEn).toBe(antes.slaResolucionVenceEn);
  });
});
