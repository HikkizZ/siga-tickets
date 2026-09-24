import { AppDataSource } from "../config/dataSource.js";
import { comparePassword, hashPassword } from "../auth/password.js";
import { signPortalCuentaToken } from "../auth/portalCuentaToken.js";
import { CuentaPortal } from "../entities/CuentaPortal.js";
import { Ticket } from "../entities/Ticket.js";
import { AppError } from "../errors/AppError.js";
import { violacionUnica } from "../errors/dbErrors.js";
import { construirDetalleTicketPortal } from "./portal.service.js";
import { crearMensajePortal, type CrearMensajePortalInput } from "./portal.mensaje.service.js";
import { ticketNoEncontrado } from "./ticket.common.js";

export interface RegistrarCuentaPortalInput {
  email: string;
  password: string;
  nombre: string;
}

// Registro público de cuenta de portal (Fase D). A diferencia del seguimiento por número+correo
// (portal.seguimiento.service.ts), acá SÍ se revela si el correo ya está registrado: confirmar
// "ese correo ya existe" en un registro público es el estándar de la industria (el modelo de
// amenaza es distinto al de enumerar tickets ajenos por número: un atacante ya puede probar
// cualquier correo contra el propio formulario de registro/login sin ganar nada nuevo con un
// mensaje genérico). Documentado también en docs/api.md.
export async function registrarCuentaPortal(input: RegistrarCuentaPortalInput): Promise<{ token: string }> {
  const repo = AppDataSource.getRepository(CuentaPortal);
  const cuenta = repo.create({
    email: input.email,
    passwordHash: await hashPassword(input.password),
    nombre: input.nombre,
    // Activa de inmediato: sin verificación de correo en esta fase (mismo nivel de confianza que
    // ya tiene hoy la creación de un ticket del portal).
    activo: true,
  });

  try {
    await repo.save(cuenta);
  } catch (err) {
    if (violacionUnica(err)) throw new AppError(409, "CONFLICT", "Ese correo ya está registrado");
    throw err;
  }

  // Loguea automáticamente tras registrarse (mismo criterio de conveniencia que muchos registros
  // públicos).
  return { token: signPortalCuentaToken(cuenta.id, cuenta.email) };
}

// Mismo mensaje/código genérico exista o no el correo, y esté activa o no (mismo espíritu que
// auth.service.ts::login con INVALID_CREDENTIALS): nunca revela cuál de las tres causas fue.
export async function loginCuentaPortal(email: string, password: string): Promise<{ token: string }> {
  const cuenta = await AppDataSource.getRepository(CuentaPortal)
    .createQueryBuilder("c")
    .addSelect("c.passwordHash")
    .where("c.email = :email", { email })
    .getOne();

  if (!cuenta || !cuenta.activo || !(await comparePassword(password, cuenta.passwordHash))) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Credenciales inválidas");
  }

  return { token: signPortalCuentaToken(cuenta.id, cuenta.email) };
}

export interface TicketResumenCuentaPortal {
  numero: string;
  asunto: string;
  estado: string;
  fechaIngreso: Date;
}

// GET /publico/cuentas/mis-tickets: todos los tickets del correo de la cuenta, paginado, DTO
// reducido (nunca ids, responsable, notas internas, etc. — mismo principio que toPortalTicket).
export async function misTicketsCuentaPortal(
  email: string,
  page: number,
  perPage: number,
): Promise<{ data: TicketResumenCuentaPortal[]; meta: { page: number; perPage: number; total: number } }> {
  // Comparación case-insensitive por la colación de la BD (Modern_Spanish_CI_AS), sin LOWER()
  // (mismo criterio que ticket.solicitanteEmail en el resto del portal).
  const [tickets, total] = await AppDataSource.getRepository(Ticket).findAndCount({
    where: { solicitanteEmail: email },
    relations: { estado: true },
    order: { fechaIngreso: "DESC" },
    skip: perPage * (page - 1),
    take: perPage,
  });

  return {
    data: tickets.map((t) => ({ numero: t.numero, asunto: t.asunto, estado: t.estado.nombre, fechaIngreso: t.fechaIngreso })),
    meta: { page, perPage, total },
  };
}

// numero + email deben coincidir en la MISMA fila (mismo patrón que seguimientoPortal): un
// ticket inexistente y uno existente de otro correo dan exactamente el mismo 404
// TICKET_NO_ENCONTRADO, nunca se distingue cuál fue.
async function resolverTicketDeCuenta(numero: string, email: string): Promise<Ticket> {
  const ticket = await AppDataSource.getRepository(Ticket).findOne({ where: { numero, solicitanteEmail: email } });
  if (!ticket) throw ticketNoEncontrado();
  return ticket;
}

// GET /publico/cuentas/tickets/:numero: misma proyección que GET /publico/ticket
// (construirDetalleTicketPortal, extraída de portal.service.ts), sin duplicar la lógica de
// mensajes/OT vinculada.
export async function detalleTicketCuentaPortal(numero: string, email: string) {
  const ticket = await resolverTicketDeCuenta(numero, email);
  return construirDetalleTicketPortal(ticket);
}

// POST /publico/cuentas/tickets/:numero/mensajes: resuelve el ticketId por número+pertenencia y
// reutiliza tal cual crearMensajePortal (portal.mensaje.service.ts, la misma función que ya usa
// POST /publico/ticket/mensajes) — mismo comportamiento de reapertura de estado, mismos adjuntos
// permitidos, sin duplicar código.
export async function responderTicketCuentaPortal(numero: string, email: string, input: CrearMensajePortalInput) {
  const ticket = await resolverTicketDeCuenta(numero, email);
  return crearMensajePortal(ticket.id, input);
}
