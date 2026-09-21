import { pino } from "pino";
import { env } from "./env.js";

// Solo se loguea metadata de la petición (método, ruta, status, duración). Nunca cuerpos,
// tokens ni datos del solicitante; el redact es una segunda barrera por si alguien los pasa.
export const logger = pino({
  level: env.logLevel,
  redact: ["req.headers.authorization", "*.password", "*.passwordHash", "*.token"],
});
