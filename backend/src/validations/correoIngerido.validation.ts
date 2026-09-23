import { z } from "zod";
import { EstadoCorreoIngerido } from "../entities/enums.js";

export const listarCorreosIngeridosReq = {
  query: z.object({
    estado: z.nativeEnum(EstadoCorreoIngerido).optional(),
    page: z.coerce.number().int().min(1).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(25),
  }),
};

export const reprocesarCorreoIngeridoReq = {
  params: z.object({ id: z.string().uuid("Id inválido") }),
};
