import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { Departamento } from "../entities/Departamento.js";
import { TemaAyuda } from "../entities/TemaAyuda.js";
import { Rol } from "../entities/enums.js";
import { conectarBD, crearSesion, limpiarBD } from "../test/helpers.js";
import { API, crearSesionNombrada } from "../test/otHelpers.js";
import { ticketBody } from "../test/ticketHelpers.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

describe("POST /tickets con temaAyudaId (Fase B1, aditivo)", () => {
  it("temaAyudaId válido y activo: se guarda y GET /tickets/:id lo devuelve con su departamento", async () => {
    const { auth } = await crearSesionNombrada(Rol.TECNICO, "tecnico_tema");
    const departamento = await AppDataSource.getRepository(Departamento).save({ nombre: "Soporte técnico" });
    const tema = await AppDataSource.getRepository(TemaAyuda).save({ nombre: "Falla de hardware", departamentoId: departamento.id });

    const res = await request(app).post(`${API}/tickets`).set("Authorization", auth).send(ticketBody({ temaAyudaId: tema.id }));

    expect(res.status).toBe(201);
    expect(res.body.data.temaAyuda).toEqual({ id: tema.id, nombre: "Falla de hardware" });

    // GET /tickets/:id (detalle) también lo expone: mismo criterio que cliente/responsable.
    const detalle = await request(app).get(`${API}/tickets/${res.body.data.id}`).set("Authorization", auth);
    expect(detalle.status).toBe(200);
    expect(detalle.body.data.temaAyuda).toEqual({ id: tema.id, nombre: "Falla de hardware" });

    // Cascada de lectura Ticket→TemaAyuda→Departamento: el propio catálogo de temas trae el
    // departamento sugerido (el detalle del ticket solo expone {id,nombre} del tema, tal como pide
    // el encargo; el departamento se verifica desde el catálogo de temas).
    const temas = await request(app).get(`${API}/temas-ayuda`).set("Authorization", auth);
    const temaListado = temas.body.data.find((t: { id: string }) => t.id === tema.id);
    expect(temaListado.departamento).toEqual({ id: departamento.id, nombre: "Soporte técnico" });
  });

  it("sin temaAyudaId: el ticket se crea igual que antes, con temaAyuda null", async () => {
    const { auth } = await crearSesionNombrada(Rol.TECNICO, "tecnico_sin_tema");

    const res = await request(app).post(`${API}/tickets`).set("Authorization", auth).send(ticketBody());

    expect(res.status).toBe(201);
    expect(res.body.data.temaAyuda).toBeNull();
  });

  it("temaAyudaId inexistente: 400 TEMA_AYUDA_INVALIDO", async () => {
    const { auth } = await crearSesionNombrada(Rol.TECNICO, "tecnico_tema_inexistente");

    const res = await request(app)
      .post(`${API}/tickets`)
      .set("Authorization", auth)
      .send(ticketBody({ temaAyudaId: "11111111-1111-4111-8111-111111111111" }));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("TEMA_AYUDA_INVALIDO");
  });

  it("temaAyudaId de un tema inactivo: 400 TEMA_AYUDA_INVALIDO", async () => {
    const { auth } = await crearSesionNombrada(Rol.TECNICO, "tecnico_tema_inactivo");
    const { auth: authAdmin } = await crearSesion(Rol.ADMIN);
    const crear = await request(app).post(`${API}/temas-ayuda`).set("Authorization", authAdmin).send({ nombre: "Tema inactivo" });
    await request(app).patch(`${API}/temas-ayuda/${crear.body.data.id}`).set("Authorization", authAdmin).send({ activo: false });

    const res = await request(app)
      .post(`${API}/tickets`)
      .set("Authorization", auth)
      .send(ticketBody({ temaAyudaId: crear.body.data.id }));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("TEMA_AYUDA_INVALIDO");
  });
});
