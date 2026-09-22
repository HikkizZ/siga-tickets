import { AppDataSource } from "../config/dataSource.js";
import { signPortalToken } from "../auth/portalToken.js";
import { Ticket } from "../entities/Ticket.js";
import { AppError } from "../errors/AppError.js";

// Mismo mensaje/código exista o no el número, y exista o no pero con otro correo — nunca se
// revela cuál de las dos cosas falló (mismo espíritu que auth.service.ts::login con
// INVALID_CREDENTIALS).
const MENSAJE_ERROR = "No pudimos validar esos datos";
const RETARDO_ERROR_MS = 200;

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// numero + email deben coincidir en la MISMA fila (comparación combinada, nunca dos consultas
// separadas: así ambas causas de fallo —número inexistente, o existente con otro correo— pasan por
// el mismo código y no hay forma de que timing o resultado delaten cuál fue). La colación
// Modern_Spanish_CI_AS de la BD ya compara solicitante_email sin distinguir mayúsculas: sin LOWER().
export async function seguimientoPortal(numero: string, email: string): Promise<{ token: string }> {
  const ticket = await AppDataSource.getRepository(Ticket).findOne({
    where: { numero, solicitanteEmail: email },
    select: { id: true },
  });

  if (!ticket) {
    // Retardo fijo (no depende de si el número existe): el tiempo de respuesta tampoco delata la
    // diferencia entre "número inexistente" y "número existente con otro correo".
    await esperar(RETARDO_ERROR_MS);
    throw new AppError(401, "SEGUIMIENTO_INVALIDO", MENSAJE_ERROR);
  }

  return { token: signPortalToken(ticket.id) };
}
