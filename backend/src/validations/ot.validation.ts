import { z } from "zod";
import { CategoriaOt, EstadoOt, OrigenOt } from "../entities/enums.js";

const uuid = (msg = "Id inválido") => z.string().uuid(msg);

// YYYY-MM-DD y además un día que exista (2026-02-30 no pasa).
export const fechaIso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (use YYYY-MM-DD)")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, "Fecha inválida");

const titulo = z.string().trim().min(1, "El título es obligatorio").max(200);
const descripcion = z.string().trim().min(1, "La descripción es obligatoria").max(20000);
const opcionalTexto = (max: number) => z.string().trim().min(1).max(max);

const paramsId = z.object({ id: uuid() });

// Espejo del CHECK ot_interna_check (interna ⇒ área sin cliente; no interna ⇒ cliente sin área).
// Factorizado (Fase 3) para que POST /tickets/:id/convertir-a-ot lo reutilice tal cual en vez de
// copiarlo a mano: ahí los valores efectivos de esInterna/clienteId/areaInterna se resuelven en
// el servicio (pueden heredarse del ticket), no directamente del body, así que no puede vivir
// dentro de un superRefine de Zod atado a ese body.
export interface ConsistenciaInterna {
  esInterna: boolean;
  clienteId?: string | null | undefined;
  areaInterna?: string | null | undefined;
}
export interface ProblemaConsistenciaInterna {
  campo: "areaInterna" | "clienteId";
  mensaje: string;
}

export function problemasConsistenciaInterna(v: ConsistenciaInterna): ProblemaConsistenciaInterna[] {
  const problemas: ProblemaConsistenciaInterna[] = [];
  if (v.esInterna) {
    if (!v.areaInterna) problemas.push({ campo: "areaInterna", mensaje: "Una OT interna requiere areaInterna" });
    if (v.clienteId) problemas.push({ campo: "clienteId", mensaje: "Una OT interna no puede tener clienteId" });
  } else {
    if (!v.clienteId) problemas.push({ campo: "clienteId", mensaje: "Una OT no interna requiere clienteId" });
    if (v.areaInterna) problemas.push({ campo: "areaInterna", mensaje: "areaInterna solo aplica a OT internas" });
  }
  return problemas;
}

export const crearOtReq = {
  body: z
    .object({
      titulo,
      descripcion,
      esInterna: z.boolean().default(false),
      clienteId: uuid("clienteId inválido").optional(),
      areaInterna: opcionalTexto(120).optional(),
      categoria: z.nativeEnum(CategoriaOt),
      prioridadId: uuid("prioridadId inválido"),
      origen: z.nativeEnum(OrigenOt),
      ubicacion: opcionalTexto(200).optional(),
      solicitanteNombre: opcionalTexto(120).optional(),
      solicitanteContacto: opcionalTexto(160).optional(),
      fechaEstimadaTermino: fechaIso.optional(),
      responsableId: uuid("responsableId inválido").optional(),
      colaboradorIds: z.array(uuid("colaboradorIds inválido")).max(20).optional(),
    })
    // strict: recepcionadoPorId (u otro campo no previsto) en el body se rechaza; sale del token.
    .strict()
    // Refleja el CHECK ot_interna_check para responder 400 claro y no un 500 por violación de CHECK.
    .superRefine((b, ctx) => {
      for (const p of problemasConsistenciaInterna(b)) ctx.addIssue({ code: "custom", path: [p.campo], message: p.mensaje });
    }),
};

export const actualizarOtReq = {
  params: paramsId,
  body: z
    .object({
      titulo: titulo.optional(),
      descripcion: descripcion.optional(),
      categoria: z.nativeEnum(CategoriaOt).optional(),
      prioridadId: uuid("prioridadId inválido").optional(),
      ubicacion: opcionalTexto(200).nullable().optional(),
      solicitanteNombre: opcionalTexto(120).nullable().optional(),
      solicitanteContacto: opcionalTexto(160).nullable().optional(),
      fechaEstimadaTermino: fechaIso.nullable().optional(),
      clienteId: uuid("clienteId inválido").optional(),
      areaInterna: opcionalTexto(120).optional(),
    })
    .strict()
    .refine((b) => Object.keys(b).length > 0, { message: "No hay campos para actualizar" }),
};

export const otIdReq = { params: paramsId };

export const cambiarEstadoReq = {
  params: paramsId,
  body: z.object({ estado: z.nativeEnum(EstadoOt) }).strict(),
};

export const derivarReq = {
  params: paramsId,
  body: z
    .object({
      destinoId: uuid("destinoId inválido"),
      motivo: z.string().trim().min(10, "El motivo debe tener al menos 10 caracteres").max(2000),
      mantenerComoColaborador: z.boolean().default(false),
    })
    .strict(),
};

export const agregarColaboradorReq = {
  params: paramsId,
  body: z.object({ usuarioId: uuid("usuarioId inválido") }).strict(),
};

export const quitarColaboradorReq = {
  params: z.object({ id: uuid(), usuarioId: uuid("usuarioId inválido") }),
};

export const crearComentarioReq = {
  params: paramsId,
  body: z
    .object({
      cuerpo: z.string().trim().min(1, "El comentario no puede estar vacío").max(10000),
      visibleCliente: z.boolean().default(false),
    })
    .strict(),
};

export const crearHoraReq = {
  params: paramsId,
  body: z
    .object({
      fecha: fechaIso,
      horas: z
        .number({ invalid_type_error: "horas debe ser un número" })
        .gt(0, "horas debe ser mayor que 0")
        .max(24, "horas no puede superar 24")
        .multipleOf(0.01, "horas admite como máximo 2 decimales"),
      detalle: opcionalTexto(2000).optional(),
      usuarioId: uuid("usuarioId inválido").optional(),
    })
    .strict(),
};

export const eliminarHoraReq = { params: z.object({ id: uuid(), horaId: uuid("horaId inválido") }) };

const nombreEtapa = z.string().trim().min(1, "El nombre es obligatorio").max(120);
const ordenEtapa = z.number().int().min(0).max(32000);

export const crearEtapaReq = {
  params: paramsId,
  body: z
    .object({ nombre: nombreEtapa, fechaInicio: fechaIso, fechaTermino: fechaIso, orden: ordenEtapa.optional() })
    .strict()
    .refine((b) => b.fechaTermino >= b.fechaInicio, {
      path: ["fechaTermino"],
      message: "fechaTermino no puede ser anterior a fechaInicio",
    }),
};

export const actualizarEtapaReq = {
  params: z.object({ id: uuid(), etapaId: uuid("etapaId inválido") }),
  body: z
    .object({
      nombre: nombreEtapa.optional(),
      fechaInicio: fechaIso.optional(),
      fechaTermino: fechaIso.optional(),
      orden: ordenEtapa.optional(),
    })
    .strict()
    .refine((b) => Object.keys(b).length > 0, { message: "No hay campos para actualizar" })
    .refine((b) => !b.fechaInicio || !b.fechaTermino || b.fechaTermino >= b.fechaInicio, {
      path: ["fechaTermino"],
      message: "fechaTermino no puede ser anterior a fechaInicio",
    }),
};

export const eliminarEtapaReq = { params: z.object({ id: uuid(), etapaId: uuid("etapaId inválido") }) };

// ---- listado / kanban ----
const booleanoQuery = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");

const filtrosOt = {
  estado: z.nativeEnum(EstadoOt).optional(),
  prioridadId: uuid("prioridadId inválido").optional(),
  categoria: z.nativeEnum(CategoriaOt).optional(),
  clienteId: uuid("clienteId inválido").optional(),
  responsableId: uuid("responsableId inválido").optional(),
  mios: booleanoQuery.optional(),
  q: z.string().trim().min(1).max(100).optional(),
  desde: fechaIso.optional(),
  hasta: fechaIso.optional(),
};

const rangoValido = (f: { desde?: string | undefined; hasta?: string | undefined }) => !f.desde || !f.hasta || f.desde <= f.hasta;
const rangoMsg = { path: ["hasta"], message: "hasta no puede ser anterior a desde" };

export const COLUMNAS_ORDEN = [
  "numero",
  "titulo",
  "estado",
  "prioridad",
  "fechaIngreso",
  "fechaEstimadaTermino",
  "creadoEn",
  "actualizadoEn",
] as const;

export const listarOtsReq = {
  query: z
    .object({
      ...filtrosOt,
      page: z.coerce.number().int().min(1).default(1),
      perPage: z.coerce.number().int().min(1).max(100).default(25),
      orden: z.enum(COLUMNAS_ORDEN).default("fechaIngreso"),
      dir: z.enum(["asc", "desc"]).default("desc"),
    })
    .refine(rangoValido, rangoMsg),
};

export const kanbanReq = {
  query: z.object(filtrosOt).refine(rangoValido, rangoMsg),
};

export type FiltrosOt = z.output<typeof kanbanReq.query>;
