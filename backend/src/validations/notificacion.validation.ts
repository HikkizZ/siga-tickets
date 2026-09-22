import { z } from "zod";

const booleanoQuery = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");

export const listarNotificacionesReq = {
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(25),
    soloNoLeidas: booleanoQuery.optional(),
  }),
};

export const notificacionIdReq = {
  params: z.object({ id: z.string().uuid("Id inválido") }),
};
