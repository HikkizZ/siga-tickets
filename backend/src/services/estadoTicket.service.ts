import { Not } from "typeorm";
import { AppDataSource } from "../config/dataSource.js";
import { EstadoTicket } from "../entities/EstadoTicket.js";
import { AppError } from "../errors/AppError.js";
import { violacionUnica } from "../errors/dbErrors.js";
import { enTransaccion, type ManagerTransaccional } from "./folio.service.js";

// Fase C: catálogo administrable de Estado de Ticket (antes enum fijo nuevo/abierto/
// esperando_cliente/resuelto/cerrado), mismo patrón CRUD que Departamento/TemaAyuda — sin DELETE
// real, solo activar/desactivar. Ver entities/EstadoTicket.ts para el significado de cada flag.

export interface EstadoTicketDto {
  id: string;
  nombre: string;
  orden: number;
  activo: boolean;
  esEstadoInicial: boolean;
  esDestinoReapertura: boolean;
  esPausaSla: boolean;
  marcaResueltoEn: boolean;
  marcaCerradoEn: boolean;
  esTerminal: boolean;
}

function toDto(e: EstadoTicket): EstadoTicketDto {
  return {
    id: e.id,
    nombre: e.nombre,
    orden: e.orden,
    activo: e.activo,
    esEstadoInicial: e.esEstadoInicial,
    esDestinoReapertura: e.esDestinoReapertura,
    esPausaSla: e.esPausaSla,
    marcaResueltoEn: e.marcaResueltoEn,
    marcaCerradoEn: e.marcaCerradoEn,
    esTerminal: e.esTerminal,
  };
}

function conflictoNombre(err: unknown): AppError | null {
  if (violacionUnica(err)) {
    return new AppError(409, "CONFLICT", "Ya existe un estado con ese nombre");
  }
  return null;
}

export async function listarEstadosTicket(): Promise<EstadoTicketDto[]> {
  const filas = await AppDataSource.getRepository(EstadoTicket).find({ order: { orden: "ASC", nombre: "ASC" } });
  return filas.map(toDto);
}

// esEstadoInicial y esDestinoReapertura son exclusivos: como mucho una fila activa* con cada flag
// en true. Al marcar una nueva fila como true, desmarca cualquier otra que lo tuviera, dentro de la
// MISMA transacción (patrón "exclusividad", sin más sofisticación: el volumen real es de pocas filas).
// (*no se exige que la fila esté activa: sigue siendo la única con el flag, igual que el resto del
// catálogo permite desactivar sin más reglas — fuera de alcance, ver encargo de esta fase.)
async function aplicarExclusividad(manager: ManagerTransaccional, campo: "esEstadoInicial" | "esDestinoReapertura", exceptoId: string): Promise<void> {
  if (campo === "esEstadoInicial") {
    await manager
      .createQueryBuilder()
      .update(EstadoTicket)
      .set({ esEstadoInicial: false })
      .where("esEstadoInicial = 1 AND id <> :exceptoId", { exceptoId })
      .execute();
  } else {
    await manager
      .createQueryBuilder()
      .update(EstadoTicket)
      .set({ esDestinoReapertura: false })
      .where("esDestinoReapertura = 1 AND id <> :exceptoId", { exceptoId })
      .execute();
  }
}

export interface CrearEstadoTicketInput {
  nombre: string;
  orden?: number | undefined;
  activo?: boolean | undefined;
  esEstadoInicial?: boolean | undefined;
  esDestinoReapertura?: boolean | undefined;
  esPausaSla?: boolean | undefined;
  marcaResueltoEn?: boolean | undefined;
  marcaCerradoEn?: boolean | undefined;
  esTerminal?: boolean | undefined;
}

export async function crearEstadoTicket(input: CrearEstadoTicketInput): Promise<EstadoTicketDto> {
  const dto = await enTransaccion(AppDataSource, async (m) => {
    const estado = m.create(EstadoTicket, {
      nombre: input.nombre,
      orden: input.orden ?? 0,
      activo: input.activo ?? true,
      esEstadoInicial: input.esEstadoInicial ?? false,
      esDestinoReapertura: input.esDestinoReapertura ?? false,
      esPausaSla: input.esPausaSla ?? false,
      marcaResueltoEn: input.marcaResueltoEn ?? false,
      marcaCerradoEn: input.marcaCerradoEn ?? false,
      esTerminal: input.esTerminal ?? false,
    });
    try {
      await m.save(EstadoTicket, estado);
    } catch (err) {
      throw conflictoNombre(err) ?? err;
    }
    if (estado.esEstadoInicial) await aplicarExclusividad(m, "esEstadoInicial", estado.id);
    if (estado.esDestinoReapertura) await aplicarExclusividad(m, "esDestinoReapertura", estado.id);
    return m.findOneByOrFail(EstadoTicket, { id: estado.id });
  });
  return toDto(dto);
}

export interface CambioEstadoTicket {
  nombre?: string | undefined;
  orden?: number | undefined;
  activo?: boolean | undefined;
  esEstadoInicial?: boolean | undefined;
  esDestinoReapertura?: boolean | undefined;
  esPausaSla?: boolean | undefined;
  marcaResueltoEn?: boolean | undefined;
  marcaCerradoEn?: boolean | undefined;
  esTerminal?: boolean | undefined;
}

// Ambos flags son invariantes de sistema (crearTicket/reabrirTicketSiCorresponde asumen que existe
// exactamente una fila con cada uno en true; si llega a cero, esas operaciones truenan para TODOS
// los tickets, no solo uno). aplicarExclusividad ya evita que existan dos; esto evita que un PATCH
// deje cero al desmarcar la única fila que lo tenía sin marcar antes otra distinta.
async function exigirOtraConFlag(manager: ManagerTransaccional, campo: "esEstadoInicial" | "esDestinoReapertura", id: string): Promise<void> {
  const otras = await manager.count(EstadoTicket, { where: { [campo]: true, id: Not(id) } });
  if (otras === 0) {
    const etiqueta = campo === "esEstadoInicial" ? "estado inicial" : "destino de reapertura";
    throw new AppError(400, "ESTADO_TICKET_SIN_REEMPLAZO", `No puedes quitar el ${etiqueta} sin antes marcar otro estado con ese rol`);
  }
}

export async function actualizarEstadoTicket(id: string, cambios: CambioEstadoTicket): Promise<EstadoTicketDto> {
  const dto = await enTransaccion(AppDataSource, async (m) => {
    const estado = await m.findOneBy(EstadoTicket, { id });
    if (!estado) throw new AppError(404, "NOT_FOUND", "Estado no encontrado");

    if (cambios.esEstadoInicial === false && estado.esEstadoInicial) await exigirOtraConFlag(m, "esEstadoInicial", id);
    if (cambios.esDestinoReapertura === false && estado.esDestinoReapertura) await exigirOtraConFlag(m, "esDestinoReapertura", id);

    if (cambios.nombre !== undefined) estado.nombre = cambios.nombre;
    if (cambios.orden !== undefined) estado.orden = cambios.orden;
    if (cambios.activo !== undefined) estado.activo = cambios.activo;
    if (cambios.esEstadoInicial !== undefined) estado.esEstadoInicial = cambios.esEstadoInicial;
    if (cambios.esDestinoReapertura !== undefined) estado.esDestinoReapertura = cambios.esDestinoReapertura;
    if (cambios.esPausaSla !== undefined) estado.esPausaSla = cambios.esPausaSla;
    if (cambios.marcaResueltoEn !== undefined) estado.marcaResueltoEn = cambios.marcaResueltoEn;
    if (cambios.marcaCerradoEn !== undefined) estado.marcaCerradoEn = cambios.marcaCerradoEn;
    if (cambios.esTerminal !== undefined) estado.esTerminal = cambios.esTerminal;

    try {
      await m.save(EstadoTicket, estado);
    } catch (err) {
      throw conflictoNombre(err) ?? err;
    }
    if (estado.esEstadoInicial) await aplicarExclusividad(m, "esEstadoInicial", id);
    if (estado.esDestinoReapertura) await aplicarExclusividad(m, "esDestinoReapertura", id);
    return m.findOneByOrFail(EstadoTicket, { id });
  });
  return toDto(dto);
}
