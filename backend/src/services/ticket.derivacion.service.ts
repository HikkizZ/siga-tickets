import { AppDataSource } from "../config/dataSource.js";
import { Ticket } from "../entities/Ticket.js";
import { EntidadAsignable } from "../entities/enums.js";
import { AppError } from "../errors/AppError.js";
import { conflictoConcurrencia } from "../errors/dbErrors.js";
import { exigir, puedeDerivar, puedeTomar } from "../policies/ticket.policy.js";
import { moverTramoResponsable, notificarDerivacion } from "./asignacion.service.js";
import { registrarEventoTicket } from "./evento.service.js";
import { enTransaccion } from "./folio.service.js";
import { usuarioAsignable, type UsuarioActor } from "./ot.common.js";
import { bloquearTicket, contextoTicket, ticketNoEncontrado } from "./ticket.common.js";
import { obtenerDetalleTicket } from "./ticket.service.js";

export interface DerivarTicketInput {
  destinoId: string;
  motivo: string;
}

export async function derivarTicket(actor: UsuarioActor, id: string, input: DerivarTicketInput) {
  // Mismo patrón de bloqueo optimista que derivarOt: lo que el actor "vio" al decidir se
  // contrasta contra el estado dentro de la transacción; si cambió entremedio, 409.
  const vista = await AppDataSource.getRepository(Ticket).findOne({ where: { id }, select: { id: true, responsableActualId: true } });
  if (!vista) throw ticketNoEncontrado();
  const responsableVisto = vista.responsableActualId;

  try {
    await enTransaccion(AppDataSource, async (m) => {
      const ticket = await bloquearTicket(m, id);
      if (ticket.responsableActualId !== responsableVisto) {
        throw new AppError(409, "CONFLICTO_CONCURRENCIA", "El ticket fue derivado por otra persona mientras tanto; reintenta");
      }
      exigir(puedeDerivar(contextoTicket(ticket, actor)), "Solo el responsable actual, gestión o admin pueden derivar el ticket");

      if (input.destinoId === ticket.responsableActualId) {
        throw new AppError(400, "DERIVACION_INVALIDA", "El destino ya es el responsable actual");
      }
      await usuarioAsignable(m, input.destinoId, "DERIVACION_INVALIDA", "El destino");

      const anteriorId = ticket.responsableActualId;
      await moverTramoResponsable(m, {
        entidadTipo: EntidadAsignable.TICKET,
        entidadId: id,
        destinoId: input.destinoId,
        motivoEntrada: input.motivo,
        derivadoPorId: actor.id,
      });

      ticket.responsableActualId = input.destinoId;
      await m.save(Ticket, ticket); // el SLA no se toca

      await registrarEventoTicket(m, id, actor.id, { tipo: "derivado", de: anteriorId, a: input.destinoId, motivo: input.motivo });
      await notificarDerivacion(m, input.destinoId, EntidadAsignable.TICKET, id, `${ticket.numero} fue derivado a ti`, input.motivo);
    });
  } catch (err) {
    throw conflictoConcurrencia(err) ?? err;
  }
  return obtenerDetalleTicket(id);
}

// Solo si responsable_actual_id es NULL (decisión 0.4 del diseño: un ticket entrante nace sin
// responsable y cualquier colega lo puede tomar). bloquearTicket (UPDLOCK) serializa dos "tomar"
// simultáneos: el segundo ve ya el responsable que puso el primero y recibe 409.
export async function tomarTicket(actor: UsuarioActor, id: string) {
  try {
    await enTransaccion(AppDataSource, async (m) => {
      const ticket = await bloquearTicket(m, id);
      exigir(puedeTomar(contextoTicket(ticket, actor)), "No tienes permiso para tomar tickets");
      if (ticket.responsableActualId !== null) {
        throw new AppError(409, "TICKET_YA_ASIGNADO", "El ticket ya tiene responsable");
      }

      await moverTramoResponsable(m, {
        entidadTipo: EntidadAsignable.TICKET,
        entidadId: id,
        destinoId: actor.id,
        motivoEntrada: null, // nadie se lo entregó, se lo tomó solo
        derivadoPorId: null,
      });

      ticket.responsableActualId = actor.id;
      await m.save(Ticket, ticket);
      await registrarEventoTicket(m, id, actor.id, { tipo: "tomado", usuarioId: actor.id });
    });
  } catch (err) {
    throw conflictoConcurrencia(err) ?? err;
  }
  return obtenerDetalleTicket(id);
}
