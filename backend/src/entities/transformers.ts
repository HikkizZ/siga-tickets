import type { ValueTransformer } from "typeorm";

// tedious devuelve decimal y bigint como string para no perder precisión.
export const numericTransformer: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};

// Los montos en CLP caben de sobra en un number (< 2^53).
export const bigintTransformer: ValueTransformer = numericTransformer;

// SQL Server entrega los uniqueidentifier en MAYÚSCULAS. Todo uuid que sale de la BD se
// normaliza a minúsculas (forma canónica del proyecto: JWT `sub`, respuestas JSON y ids de
// entrada coinciden). Al escribir no hace falta: SQL Server compara uuid sin distinguir caso.
export const uuidTransformer: ValueTransformer = {
  to: (value: string | null | undefined) => value,
  from: (value: string | null | undefined) => (typeof value === "string" ? value.toLowerCase() : value),
};

// nvarchar(max) con CHECK (ISJSON(col) = 1) para lo que en PG era jsonb / text[].
export const jsonTransformer: ValueTransformer = {
  to: (value: unknown) => (value === null || value === undefined ? value : JSON.stringify(value)),
  from: (value: string | null | undefined) => (typeof value === "string" ? JSON.parse(value) : value),
};
