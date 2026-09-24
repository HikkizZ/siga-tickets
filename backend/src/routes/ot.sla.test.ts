import { DateTime } from "luxon";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { sumarHorasHabiles, ZONA_HORARIA_SLA } from "../sla/horasHabiles.js";
import { conectarBD, limpiarBD, obtenerPrioridadPorNombre } from "../test/helpers.js";
import { API, crearClienteTest, crearOtApi, crearSesionNombrada } from "../test/otHelpers.js";
import { calendarioYFeriadosReales } from "../test/slaHelpers.js";
import { Rol } from "../entities/enums.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

// Fase C: sla_config se retiró; estos son los mismos valores reales (docs/backend-diseno.md
// sección de esta fase) que ahora vive en plan_sla, sembrados por la migración y por
// test/helpers.ts::limpiarBD.
const HORAS_RESOLUCION: Record<string, number> = { alta: 24, media: 48, baja: 120 };
const NOMBRE_PRIORIDAD: Record<string, string> = { alta: "Alta", media: "Media", baja: "Baja" };

async function detalleOt(auth: string, id: string) {
  const res = await request(app).get(`${API}/ots/${id}`).set("Authorization", auth);
  if (res.status !== 200) throw new Error(`detalleOt falló: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data as { fechaIngreso: string; slaResolucionVenceEn: string | null; prioridad: { id: string; nombre: string } };
}

describe("SLA al crear/editar una OT (Fase 4)", () => {
  it.each(["alta", "media", "baja"] as const)("calcula slaResolucionVenceEn con las horas hábiles de la prioridad %s", async (prioridad) => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_ot_sla");
    const cliente = await crearClienteTest();
    const prioridadFila = await obtenerPrioridadPorNombre(NOMBRE_PRIORIDAD[prioridad]!);
    const ot = await crearOtApi(admin.auth, cliente.id, { prioridadId: prioridadFila.id });

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
    const [baja, alta] = await Promise.all([obtenerPrioridadPorNombre("Baja"), obtenerPrioridadPorNombre("Alta")]);
    const ot = await crearOtApi(admin.auth, cliente.id, { prioridadId: baja.id });
    const antes = await detalleOt(admin.auth, ot.id);

    const res = await request(app).patch(`${API}/ots/${ot.id}`).set("Authorization", admin.auth).send({ prioridadId: alta.id });
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
    const media = await obtenerPrioridadPorNombre("Media");
    const ot = await crearOtApi(admin.auth, cliente.id, { prioridadId: media.id });
    const antes = await detalleOt(admin.auth, ot.id);

    const res = await request(app).patch(`${API}/ots/${ot.id}`).set("Authorization", admin.auth).send({ titulo: "Nuevo título" });

    expect(res.status).toBe(200);
    expect(res.body.data.slaResolucionVenceEn).toBe(antes.slaResolucionVenceEn);
  });
});
