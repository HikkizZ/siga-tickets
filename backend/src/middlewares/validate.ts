import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodTypeAny, z } from "zod";
import { AppError } from "../errors/AppError.js";

export interface EsquemasRequest {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
}

export type Validado<S extends EsquemasRequest> = {
  [K in keyof S]: S[K] extends ZodTypeAny ? z.output<S[K]> : never;
};

// Valida y deja el resultado ya parseado (con trim, lowercase, defaults) en req.validated.
export function validate(esquemas: EsquemasRequest): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const validado: NonNullable<Request["validated"]> = {};
    const problemas: Array<{ campo: string; mensaje: string }> = [];

    for (const parte of ["body", "params", "query"] as const) {
      const esquema = esquemas[parte];
      if (!esquema) continue;
      const resultado = esquema.safeParse(req[parte]);
      if (resultado.success) {
        validado[parte] = resultado.data;
      } else {
        for (const issue of resultado.error.issues) {
          problemas.push({ campo: [parte, ...issue.path].join("."), mensaje: issue.message });
        }
      }
    }

    if (problemas.length > 0) {
      throw new AppError(400, "VALIDATION_ERROR", "Datos inválidos", problemas);
    }

    req.validated = validado;
    next();
  };
}

// El segundo argumento solo sirve para inferir el tipo: validado(req, esquemas).body ya viene tipado.
export function validado<S extends EsquemasRequest>(req: Request, _esquemas: S): Validado<S> {
  return req.validated as Validado<S>;
}
