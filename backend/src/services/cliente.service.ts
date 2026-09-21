import { AppDataSource } from "../config/dataSource.js";
import { Cliente } from "../entities/Cliente.js";
import { AppError } from "../errors/AppError.js";
import { violacionUnica } from "../errors/dbErrors.js";

export interface ClienteDto {
  id: string;
  nombre: string;
  activo: boolean;
}

function toClienteDto(c: Cliente): ClienteDto {
  return { id: c.id, nombre: c.nombre, activo: c.activo };
}

function conflictoNombre(err: unknown): AppError | null {
  if (violacionUnica(err)) {
    return new AppError(409, "CONFLICT", "Ya existe un cliente con ese nombre");
  }
  return null;
}

export async function listarClientes(): Promise<ClienteDto[]> {
  const clientes = await AppDataSource.getRepository(Cliente).find({ order: { nombre: "ASC" } });
  return clientes.map(toClienteDto);
}

export async function crearCliente(nombre: string): Promise<ClienteDto> {
  const repo = AppDataSource.getRepository(Cliente);
  const cliente = repo.create({ nombre });
  try {
    await repo.save(cliente);
  } catch (err) {
    throw conflictoNombre(err) ?? err;
  }
  return toClienteDto(cliente);
}

export async function actualizarCliente(
  id: string,
  cambios: { nombre?: string | undefined; activo?: boolean | undefined },
): Promise<ClienteDto> {
  const repo = AppDataSource.getRepository(Cliente);
  const cliente = await repo.findOneBy({ id });
  if (!cliente) throw new AppError(404, "NOT_FOUND", "Cliente no encontrado");

  if (cambios.nombre !== undefined) cliente.nombre = cambios.nombre;
  if (cambios.activo !== undefined) cliente.activo = cambios.activo;

  try {
    await repo.save(cliente);
  } catch (err) {
    throw conflictoNombre(err) ?? err;
  }
  return toClienteDto(cliente);
}
