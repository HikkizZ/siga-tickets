import { z } from "zod";
import { fechaIso } from "./ot.validation.js";

// Mismo criterio de rango que ot/ticket/cotizacion.validation.ts (duplicado a propósito, no hay
// un módulo compartido de filtros de fecha en el proyecto).
const rangoValido = (f: { desde?: string | undefined; hasta?: string | undefined }) => !f.desde || !f.hasta || f.desde <= f.hasta;
const rangoMsg = { path: ["hasta"], message: "hasta no puede ser anterior a desde" };

export const dashboardReq = {
  query: z
    .object({
      desde: fechaIso.optional(),
      hasta: fechaIso.optional(),
    })
    .refine(rangoValido, rangoMsg),
};

export type FiltrosDashboard = z.output<typeof dashboardReq.query>;
