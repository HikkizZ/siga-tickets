import { z } from "zod";

// Mismo estilo que el resto de los filtros `q` de la API (ot/ticket/cotizacion): min 1, max 100.
export const buscarReq = {
  query: z.object({
    q: z.string().trim().min(1, "q es obligatorio").max(100),
  }),
};
