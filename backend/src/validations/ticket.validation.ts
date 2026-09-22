import { z } from "zod";
import { CanalTicket, CategoriaOt, EstadoTicket, Prioridad } from "../entities/enums.js";
import { fechaIso } from "./ot.validation.js";

const uuid = (msg = "Id inválido") => z.string().uuid(msg);
const paramsId = z.object({ id: uuid() });

const asunto = z.string().trim().min(1, "El asunto es obligatorio").max(200);
const descripcion = z.string().trim().min(1, "La descripción es obligatoria").max(20000);
const opcionalTexto = (max: number) => z.string().trim().min(1).max(max);

// Alta interna (POST /tickets): nunca portal ni correo, esos canales son de fases futuras
// (ingesta de correo y portal público).
const canalInterno = z.enum(["telefono", "presencial", "interno"], {
  errorMap: () => ({ message: "canal debe ser telefono, presencial o interno (portal/correo son de fases futuras)" }),
});

export const crearTicketReq = {
  body: z
    .object({
      asunto,
      descripcion,
      solicitanteNombre: opcionalTexto(120),
      solicitanteEmail: z.string().trim().email("solicitanteEmail inválido").max(320),
      solicitanteTelefono: opcionalTexto(40).optional(),
      solicitanteEmpresa: opcionalTexto(160).optional(),
      clienteId: uuid("clienteId inválido").optional(),
      canal: canalInterno,
      prioridad: z.nativeEnum(Prioridad),
    })
    .strict(),
};

export const actualizarTicketReq = {
  params: paramsId,
  body: z
    .object({
      asunto: asunto.optional(),
      descripcion: descripcion.optional(),
      prioridad: z.nativeEnum(Prioridad).optional(),
    })
    .strict()
    .refine((b) => Object.keys(b).length > 0, { message: "No hay campos para actualizar" }),
};

export const ticketIdReq = { params: paramsId };

export const cambiarEstadoTicketReq = {
  params: paramsId,
  body: z.object({ estado: z.nativeEnum(EstadoTicket) }).strict(),
};

export const derivarTicketReq = {
  params: paramsId,
  body: z
    .object({
      destinoId: uuid("destinoId inválido"),
      motivo: z.string().trim().min(10, "El motivo debe tener al menos 10 caracteres").max(2000),
    })
    // Sin mantenerComoColaborador: el ticket no tiene colaboradores (ver ticket.policy.ts); si
    // llega, .strict() lo rechaza en vez de ignorarlo en silencio.
    .strict(),
};

// tipo restringido a los dos que puede crear el panel interno: los mensajes tipo 'cliente' los
// crea el portal o la ingesta de correo (fases futuras), nunca este endpoint.
export const crearMensajeReq = {
  params: paramsId,
  body: z
    .object({
      tipo: z.enum(["respuesta_cliente", "nota_interna"]),
      cuerpo: z.string().trim().min(1, "El mensaje no puede estar vacío").max(20000),
      adjuntoIds: z.array(uuid("adjuntoIds inválido")).max(20).optional(),
    })
    .strict(),
};

export const convertirATicketOtReq = {
  params: paramsId,
  body: z
    .object({
      titulo: z.string().trim().min(1).max(200).optional(),
      descripcion: z.string().trim().min(1).max(20000).optional(),
      categoria: z.nativeEnum(CategoriaOt),
      prioridad: z.nativeEnum(Prioridad).optional(),
      ubicacion: opcionalTexto(200).optional(),
      fechaEstimadaTermino: fechaIso.optional(),
      clienteId: uuid("clienteId inválido").optional(),
      areaInterna: opcionalTexto(120).optional(),
      esInterna: z.boolean().optional(),
    })
    .strict(),
};

export const vincularOtReq = {
  params: paramsId,
  body: z.object({ otId: uuid("otId inválido") }).strict(),
};

export const desvincularOtReq = { params: z.object({ id: uuid(), otId: uuid("otId inválido") }) };

// ---- listado ----
const booleanoQuery = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");

const filtrosTicket = {
  estado: z.nativeEnum(EstadoTicket).optional(),
  prioridad: z.nativeEnum(Prioridad).optional(),
  canal: z.nativeEnum(CanalTicket).optional(),
  responsable: uuid("responsable inválido").optional(),
  mios: booleanoQuery.optional(),
  sinAsignar: booleanoQuery.optional(),
  q: z.string().trim().min(1).max(100).optional(),
  desde: fechaIso.optional(),
  hasta: fechaIso.optional(),
};

const rangoValido = (f: { desde?: string | undefined; hasta?: string | undefined }) => !f.desde || !f.hasta || f.desde <= f.hasta;
const rangoMsg = { path: ["hasta"], message: "hasta no puede ser anterior a desde" };

export const COLUMNAS_ORDEN_TICKET = ["numero", "asunto", "estado", "prioridad", "fechaIngreso", "creadoEn", "actualizadoEn"] as const;

export const listarTicketsReq = {
  query: z
    .object({
      ...filtrosTicket,
      page: z.coerce.number().int().min(1).default(1),
      perPage: z.coerce.number().int().min(1).max(100).default(25),
      orden: z.enum(COLUMNAS_ORDEN_TICKET).default("fechaIngreso"),
      dir: z.enum(["asc", "desc"]).default("desc"),
    })
    .refine(rangoValido, rangoMsg),
};

export type FiltrosTicket = z.output<typeof listarTicketsReq.query>;
