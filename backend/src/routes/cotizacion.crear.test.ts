import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { Rol } from "../entities/enums.js";
import { conectarBD, limpiarBD } from "../test/helpers.js";
import { API, cotizacionBody, crearClienteTest, crearCotizacionApi, crearOtApi, crearSesionNombrada } from "../test/otHelpers.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

const post = (auth: string, url: string, body: object) => request(app).post(`${API}${url}`).set("Authorization", auth).send(body);

async function principalDe(otId: string) {
  return (await AppDataSource.query(`SELECT id, es_principal FROM cotizacion WHERE ot_id = @0`, [otId])) as Array<{
    id: string;
    es_principal: boolean;
  }>;
}

async function eventosOt(otId: string) {
  return (await AppDataSource.query(`SELECT tipo, payload FROM evento WHERE entidad_tipo = 'ot' AND entidad_id = @0 ORDER BY id`, [
    otId,
  ])) as Array<{ tipo: string; payload: string }>;
}

describe("POST /cotizaciones", () => {
  it("folio consecutivo COT-xxxx, estado inicial borrador, version 1 sin OT", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
    const cliente = await crearClienteTest();

    const a = await post(gestion.auth, "/cotizaciones", cotizacionBody({ clienteId: cliente.id }));
    const b = await post(gestion.auth, "/cotizaciones", cotizacionBody({ clienteId: cliente.id }));

    expect(a.status).toBe(201);
    expect(a.body.data.numero).toBe("COT-2041");
    expect(b.body.data.numero).toBe("COT-2042");
    expect(a.body.data.estado).toBe("borrador");
    expect(a.body.data.version).toBe(1);
    expect(a.body.data.esPrincipal).toBe(false);
    expect(a.body.data.ot).toBeNull();
    expect(a.body.data.cliente).toEqual({ id: cliente.id, nombre: cliente.nombre });
  });

  it("un campo estado en el body se rechaza (strict): la cotización siempre nace en borrador", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
    const cliente = await crearClienteTest();

    const res = await post(gestion.auth, "/cotizaciones", cotizacionBody({ clienteId: cliente.id, estado: "aprobada" }));

    expect(res.status).toBe(400);
  });

  it("sin otId, clienteId es obligatorio: 400", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");

    const res = await post(gestion.auth, "/cotizaciones", cotizacionBody());

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("montoClp negativo o no entero: 400 (no 500)", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
    const cliente = await crearClienteTest();

    const negativo = await post(gestion.auth, "/cotizaciones", cotizacionBody({ clienteId: cliente.id, montoClp: -1 }));
    const decimal = await post(gestion.auth, "/cotizaciones", cotizacionBody({ clienteId: cliente.id, montoClp: 1.5 }));

    expect(negativo.status).toBe(400);
    expect(decimal.status).toBe(400);
  });

  it("otId inexistente: 404 OT_NO_ENCONTRADA", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");

    const res = await post(gestion.auth, "/cotizaciones", cotizacionBody({ otId: "11111111-1111-4111-8111-111111111111" }));

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("OT_NO_ENCONTRADA");
  });

  it("clienteId inexistente o inactivo: 400 CLIENTE_INVALIDO", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
    const inactivo = await crearClienteTest("Inactivo SA", false);

    const a = await post(gestion.auth, "/cotizaciones", cotizacionBody({ clienteId: inactivo.id }));
    const b = await post(gestion.auth, "/cotizaciones", cotizacionBody({ clienteId: "11111111-1111-4111-8111-111111111111" }));

    expect(a.status).toBe(400);
    expect(a.body.code).toBe("CLIENTE_INVALIDO");
    expect(b.body.code).toBe("CLIENTE_INVALIDO");
  });

  describe("con OT no interna", () => {
    it("autocompleta clienteId desde la OT si no se especifica", async () => {
      const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
      const cliente = await crearClienteTest();
      const ot = await crearOtApi(gestion.auth, cliente.id);

      const res = await post(gestion.auth, "/cotizaciones", cotizacionBody({ otId: ot.id }));

      expect(res.status).toBe(201);
      expect(res.body.data.cliente).toEqual({ id: cliente.id, nombre: cliente.nombre });
      expect(res.body.data.ot).toMatchObject({ id: ot.id, numero: ot.numero });
    });

    it("clienteId que no coincide con el de la OT: 400 claro", async () => {
      const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
      const cliente = await crearClienteTest();
      const otroCliente = await crearClienteTest("Otro cliente");
      const ot = await crearOtApi(gestion.auth, cliente.id);

      const res = await post(gestion.auth, "/cotizaciones", cotizacionBody({ otId: ot.id, clienteId: otroCliente.id }));

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("CLIENTE_NO_COINCIDE");
    });

    it("clienteId igual al de la OT: se acepta", async () => {
      const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
      const cliente = await crearClienteTest();
      const ot = await crearOtApi(gestion.auth, cliente.id);

      const res = await post(gestion.auth, "/cotizaciones", cotizacionBody({ otId: ot.id, clienteId: cliente.id }));

      expect(res.status).toBe(201);
    });
  });

  it("con OT interna, no exige clienteId", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
    const ot = await crearOtApi(gestion.auth, "", { clienteId: undefined, esInterna: true, areaInterna: "Sistemas" });

    const res = await post(gestion.auth, "/cotizaciones", cotizacionBody({ otId: ot.id }));

    expect(res.status).toBe(201);
    expect(res.body.data.cliente).toBeNull();
  });

  it("version: MAX(version)+1 para la misma OT; 1 en otra OT distinta", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
    const cliente = await crearClienteTest();
    const otA = await crearOtApi(gestion.auth, cliente.id);
    const otB = await crearOtApi(gestion.auth, cliente.id);

    const a1 = await post(gestion.auth, "/cotizaciones", cotizacionBody({ otId: otA.id }));
    const a2 = await post(gestion.auth, "/cotizaciones", cotizacionBody({ otId: otA.id }));
    const b1 = await post(gestion.auth, "/cotizaciones", cotizacionBody({ otId: otB.id }));

    expect(a1.body.data.version).toBe(1);
    expect(a2.body.data.version).toBe(2);
    expect(b1.body.data.version).toBe(1);
  });

  it("inserta el evento cotizacion_creada en la OT cuando hay otId, y ninguno si no hay OT", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
    const cliente = await crearClienteTest();
    const ot = await crearOtApi(gestion.auth, cliente.id);

    const conOt = await post(gestion.auth, "/cotizaciones", cotizacionBody({ otId: ot.id }));
    await post(gestion.auth, "/cotizaciones", cotizacionBody({ clienteId: cliente.id }));

    const eventos = await eventosOt(ot.id);
    expect(eventos.map((e) => e.tipo)).toEqual(["creado", "cotizacion_creada"]);
    expect(JSON.parse(eventos[1]!.payload)).toEqual({ cotizacionId: conOt.body.data.id, numero: conOt.body.data.numero });
  });

  it("esPrincipal=true desplaza a la principal anterior de la misma OT", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
    const cliente = await crearClienteTest();
    const ot = await crearOtApi(gestion.auth, cliente.id);

    const primera = await crearCotizacionApi(gestion.auth, { otId: ot.id, esPrincipal: true });
    const segunda = await post(gestion.auth, "/cotizaciones", cotizacionBody({ otId: ot.id, esPrincipal: true }));

    expect(segunda.body.data.esPrincipal).toBe(true);
    const filas = await principalDe(ot.id);
    const principales = filas.filter((f) => f.es_principal);
    expect(principales).toHaveLength(1);
    expect(principales[0]!.id.toLowerCase()).toBe(segunda.body.data.id);
    expect(primera.esPrincipal).toBe(true); // la respuesta original, antes de perder el flag
  });

  it("dos creaciones 'principal' concurrentes para la misma OT: ambas se crean, solo una queda principal", async () => {
    const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
    const cliente = await crearClienteTest();
    const ot = await crearOtApi(gestion.auth, cliente.id);

    const [a, b] = await Promise.all([
      post(gestion.auth, "/cotizaciones", cotizacionBody({ otId: ot.id, esPrincipal: true, montoClp: 111 })),
      post(gestion.auth, "/cotizaciones", cotizacionBody({ otId: ot.id, esPrincipal: true, montoClp: 222 })),
    ]);

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const filas = await principalDe(ot.id);
    expect(filas).toHaveLength(2);
    expect(filas.filter((f) => f.es_principal)).toHaveLength(1); // nunca 0 ni 2
  });
});
