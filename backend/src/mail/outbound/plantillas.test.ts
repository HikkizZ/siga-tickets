import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppDataSource } from "../../config/dataSource.js";
import { PlantillaCorreo } from "../../entities/PlantillaCorreo.js";
import { conectarBD, limpiarBD } from "../../test/helpers.js";
import { renderPlantilla, renderPlantillaConfigurable, type DatosRespuestaCliente, type DatosTicketCreado } from "./plantillas.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(() => AppDataSource.destroy());

const datosTicketCreado: DatosTicketCreado = { numero: "TK-0001", asunto: "No enciende", nombreSolicitante: "Juan Pérez" };
const datosRespuesta: DatosRespuestaCliente = { numero: "TK-0001", asunto: "No enciende", cuerpo: "Ya lo revisamos" };

async function guardarPlantilla(nombre: string, cambios: { asunto: string; cuerpoHtml: string; activa?: boolean }) {
  await AppDataSource.getRepository(PlantillaCorreo).save({
    nombre,
    asunto: cambios.asunto,
    cuerpoHtml: cambios.cuerpoHtml,
    activa: cambios.activa ?? true,
    actualizadoPorId: null,
  });
}

describe("renderPlantillaConfigurable (Fase B2, fallback seguro)", () => {
  it("sin fila en BD, cae al texto fijo de renderPlantilla", async () => {
    const configurable = await renderPlantillaConfigurable("ticket_creado", datosTicketCreado);
    const fijo = renderPlantilla("ticket_creado", datosTicketCreado);
    expect(configurable).toEqual(fijo);
  });

  it("con una plantilla personalizada activa, interpola los placeholders presentes", async () => {
    await guardarPlantilla("respuesta_cliente", {
      asunto: "[{{numero}}] Respuesta personalizada",
      cuerpoHtml: "<p>Hola, sobre {{asunto}}: {{cuerpo}}</p>",
    });

    const resultado = await renderPlantillaConfigurable("respuesta_cliente", datosRespuesta);

    expect(resultado.asunto).toBe("[TK-0001] Respuesta personalizada");
    expect(resultado.cuerpoHtml).toBe("<p>Hola, sobre No enciende: Ya lo revisamos</p>");
  });

  it("escapa HTML malicioso en un dato aunque la plantilla la haya editado un admin", async () => {
    await guardarPlantilla("respuesta_cliente", {
      asunto: "Re: {{asunto}}",
      cuerpoHtml: "<p>{{cuerpo}}</p>",
    });

    const resultado = await renderPlantillaConfigurable("respuesta_cliente", {
      numero: "TK-0001",
      asunto: "No enciende",
      cuerpo: "<script>alert(1)</script>",
    });

    expect(resultado.cuerpoHtml).not.toContain("<script>");
    expect(resultado.cuerpoHtml).toContain("&lt;script&gt;");
  });

  it("plantilla activa pero con un placeholder desconocido: la interpolación falla y cae al fijo", async () => {
    await guardarPlantilla("ticket_creado", {
      asunto: "[{{numero}}] {{campoQueNoExiste}}",
      cuerpoHtml: "<p>Hola {{nombreSolicitante}}</p>",
    });

    const configurable = await renderPlantillaConfigurable("ticket_creado", datosTicketCreado);
    const fijo = renderPlantilla("ticket_creado", datosTicketCreado);
    expect(configurable).toEqual(fijo);
  });

  it("plantilla desactivada (activa=false): cae al fijo aunque el texto sea válido", async () => {
    await guardarPlantilla("ticket_creado", {
      asunto: "[{{numero}}] Personalizado",
      cuerpoHtml: "<p>{{nombreSolicitante}}</p>",
      activa: false,
    });

    const configurable = await renderPlantillaConfigurable("ticket_creado", datosTicketCreado);
    const fijo = renderPlantilla("ticket_creado", datosTicketCreado);
    expect(configurable).toEqual(fijo);
  });

  it("un placeholder ausente del texto (no todos los campos de `datos` se usan) no rompe nada", async () => {
    // La plantilla solo usa {{numero}}: nombreSolicitante y asunto existen en `datos` pero no
    // aparecen en el texto, y eso es válido (no todo dato tiene que usarse).
    await guardarPlantilla("ticket_creado", {
      asunto: "[{{numero}}] Recibido",
      cuerpoHtml: "<p>Gracias por escribir.</p>",
    });

    const resultado = await renderPlantillaConfigurable("ticket_creado", datosTicketCreado);
    expect(resultado.asunto).toBe("[TK-0001] Recibido");
    expect(resultado.cuerpoHtml).toBe("<p>Gracias por escribir.</p>");
  });
});
