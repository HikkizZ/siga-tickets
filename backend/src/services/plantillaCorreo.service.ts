import { AppDataSource } from "../config/dataSource.js";
import { PlantillaCorreo } from "../entities/PlantillaCorreo.js";
import type { NombrePlantilla } from "../mail/outbound/plantillas.js";

// Fase B2: catálogo CRUD de plantillas de correo editables. El uso real en el envío (con fallback
// al texto fijo) vive en mail/outbound/plantillas.ts::renderPlantillaConfigurable, que llama a
// obtenerPlantillaActiva() de este archivo — nunca al revés (mail/outbound/index.ts ya sigue el
// mismo sentido con services/correoConfig.service.ts).
const NOMBRES_PLANTILLA: readonly NombrePlantilla[] = ["ticket_creado", "aviso_soporte", "respuesta_cliente"];

// Representación de solo LECTURA del texto fijo actual (mail/outbound/plantillas.ts::renderPlantilla),
// con los mismos placeholders {{campo}} que ya usa la Fase B2, usada ÚNICAMENTE para que
// GET /correo/plantillas tenga algo que mostrar cuando todavía no hay personalización. Nunca se usa
// para renderizar un correo real: eso siempre pasa por renderPlantilla() (la función real, no este
// texto). Si el switch de renderPlantilla cambia, hay que actualizar esto a mano para que coincidan.
const TEXTO_FIJO_PARA_MOSTRAR: Record<NombrePlantilla, { asunto: string; cuerpoHtml: string }> = {
  ticket_creado: {
    asunto: "[{{numero}}] Recibimos tu solicitud",
    cuerpoHtml:
      "<p>Hola {{nombreSolicitante}},</p>" +
      '<p>Recibimos tu solicitud <strong>{{numero}}</strong>: "{{asunto}}".</p>' +
      "<p>Puedes hacer seguimiento en el portal con tu número de ticket y tu correo.</p>",
  },
  aviso_soporte: {
    asunto: "Nuevo ticket {{numero}}: {{asunto}}",
    cuerpoHtml:
      "<p>Nuevo ticket recibido por el portal.</p>" +
      "<p><strong>{{numero}}</strong> — {{asunto}}</p>" +
      "<p>Solicitante: {{nombreSolicitante}} ({{correoSolicitante}})</p>",
  },
  respuesta_cliente: {
    asunto: "Re: [{{numero}}] {{asunto}}",
    cuerpoHtml: "<p>{{cuerpo}}</p>",
  },
};

export interface PlantillaCorreoDto {
  nombre: NombrePlantilla;
  asunto: string;
  cuerpoHtml: string;
  activa: boolean;
  personalizada: boolean;
  actualizadoEn: Date | null;
}

// Siempre las 3 (ticket_creado, aviso_soporte, respuesta_cliente), aunque no exista fila en BD
// para alguna: se completa con el texto fijo actual y `personalizada:false`, para que el frontend
// siempre tenga algo que mostrar.
export async function listarPlantillasCorreo(): Promise<PlantillaCorreoDto[]> {
  const filas = await AppDataSource.getRepository(PlantillaCorreo).find();
  const porNombre = new Map(filas.map((f) => [f.nombre, f]));

  return NOMBRES_PLANTILLA.map((nombre) => {
    const fila = porNombre.get(nombre);
    if (fila) {
      return {
        nombre,
        asunto: fila.asunto,
        cuerpoHtml: fila.cuerpoHtml,
        activa: fila.activa,
        personalizada: true,
        actualizadoEn: fila.actualizadoEn,
      };
    }
    const fija = TEXTO_FIJO_PARA_MOSTRAR[nombre];
    return { nombre, asunto: fija.asunto, cuerpoHtml: fija.cuerpoHtml, activa: true, personalizada: false, actualizadoEn: null };
  });
}

export interface CambioPlantillaCorreo {
  asunto: string;
  cuerpoHtml: string;
  activa?: boolean | undefined;
}

// Upsert de la fila `nombre` (PK). `activa` por defecto true en la creación; en una actualización
// sobre una fila existente, si no viene, se deja como estaba.
export async function actualizarPlantillaCorreo(nombre: NombrePlantilla, cambios: CambioPlantillaCorreo, actorId: string): Promise<PlantillaCorreoDto> {
  const repo = AppDataSource.getRepository(PlantillaCorreo);
  let fila = await repo.findOneBy({ nombre });
  if (!fila) fila = repo.create({ nombre, activa: true });

  fila.asunto = cambios.asunto;
  fila.cuerpoHtml = cambios.cuerpoHtml;
  if (cambios.activa !== undefined) fila.activa = cambios.activa;
  fila.actualizadoEn = new Date();
  fila.actualizadoPorId = actorId;

  await repo.save(fila);
  return { nombre: fila.nombre as NombrePlantilla, asunto: fila.asunto, cuerpoHtml: fila.cuerpoHtml, activa: fila.activa, personalizada: true, actualizadoEn: fila.actualizadoEn };
}

// USO EXCLUSIVO de mail/outbound/plantillas.ts::renderPlantillaConfigurable: la fila activa para
// interpolar, o null si no hay personalización usable (sin fila, o `activa=false`) — nunca lanza;
// quien llama decide el fallback.
export async function obtenerPlantillaActiva(nombre: NombrePlantilla): Promise<{ asunto: string; cuerpoHtml: string } | null> {
  const fila = await AppDataSource.getRepository(PlantillaCorreo).findOneBy({ nombre });
  if (!fila || !fila.activa) return null;
  return { asunto: fila.asunto, cuerpoHtml: fila.cuerpoHtml };
}
