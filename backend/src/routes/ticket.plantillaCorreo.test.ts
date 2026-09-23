import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { conectarBD, limpiarBD } from "../test/helpers.js";
import { API } from "../test/otHelpers.js";
import { crearEscenarioTicket } from "../test/ticketHelpers.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

// Fase B2, flujo real de punta a punta: POST /tickets/:id/mensajes (tipo respuesta_cliente) llama
// a correo.service.ts::encolarCorreo, que ahora pasa por renderPlantillaConfigurable(). Este test
// verifica que el correo saliente real (la fila en correo_saliente) usa la plantilla personalizada
// cuando existe y está activa, y cae sola al texto fijo cuando no hay una o se desactiva.
async function ultimoCorreoDelTicket(numero: string) {
  const filas: Array<{ asunto: string; cuerpo_html: string }> = await AppDataSource.query(
    `SELECT TOP 1 asunto, cuerpo_html
     FROM correo_saliente
     WHERE JSON_VALUE(headers, '$."X-SIGA-Ticket"') = @0
     ORDER BY creado_en DESC`,
    [numero],
  );
  return filas[0] ?? null;
}

describe("correo saliente real con plantilla configurable (Fase B2)", () => {
  it("sin personalización, el correo usa el texto fijo de renderPlantilla", async () => {
    const esc = await crearEscenarioTicket();

    const res = await request(app)
      .post(`${API}/tickets/${esc.ticketId}/mensajes`)
      .set("Authorization", esc.resp.auth)
      .send({ tipo: "respuesta_cliente", cuerpo: "Ya revisamos el equipo" });
    expect(res.status).toBe(201);

    const correo = await ultimoCorreoDelTicket(esc.numero);
    expect(correo).not.toBeNull();
    expect(correo!.asunto).toBe(`Re: [${esc.numero}] No enciende el equipo`);
    expect(correo!.cuerpo_html).toBe("<p>Ya revisamos el equipo</p>");
  });

  it("con la plantilla respuesta_cliente personalizada y activa, el correo usa el texto del admin", async () => {
    const esc = await crearEscenarioTicket();

    const put = await request(app)
      .put(`${API}/correo/plantillas/respuesta_cliente`)
      .set("Authorization", esc.admin.auth)
      .send({ asunto: "[{{numero}}] Tenemos novedades", cuerpoHtml: "<p>Equipo SIGA dice: {{cuerpo}}</p>" });
    expect(put.status).toBe(200);

    const res = await request(app)
      .post(`${API}/tickets/${esc.ticketId}/mensajes`)
      .set("Authorization", esc.resp.auth)
      .send({ tipo: "respuesta_cliente", cuerpo: "Ya revisamos el equipo" });
    expect(res.status).toBe(201);

    const correo = await ultimoCorreoDelTicket(esc.numero);
    expect(correo!.asunto).toBe(`[${esc.numero}] Tenemos novedades`);
    expect(correo!.cuerpo_html).toBe("<p>Equipo SIGA dice: Ya revisamos el equipo</p>");
  });

  it("al desactivar la plantilla personalizada, el correo vuelve al texto fijo", async () => {
    const esc = await crearEscenarioTicket();

    await request(app)
      .put(`${API}/correo/plantillas/respuesta_cliente`)
      .set("Authorization", esc.admin.auth)
      .send({ asunto: "[{{numero}}] Personalizado", cuerpoHtml: "<p>{{cuerpo}}</p>" });

    await request(app)
      .put(`${API}/correo/plantillas/respuesta_cliente`)
      .set("Authorization", esc.admin.auth)
      .send({ asunto: "[{{numero}}] Personalizado", cuerpoHtml: "<p>{{cuerpo}}</p>", activa: false });

    const res = await request(app)
      .post(`${API}/tickets/${esc.ticketId}/mensajes`)
      .set("Authorization", esc.resp.auth)
      .send({ tipo: "respuesta_cliente", cuerpo: "Ya revisamos el equipo" });
    expect(res.status).toBe(201);

    const correo = await ultimoCorreoDelTicket(esc.numero);
    expect(correo!.asunto).toBe(`Re: [${esc.numero}] No enciende el equipo`);
    expect(correo!.cuerpo_html).toBe("<p>Ya revisamos el equipo</p>");
  });
});
