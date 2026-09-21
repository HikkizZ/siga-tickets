import { AppDataSource } from "../config/dataSource.js";
import { Usuario, SISTEMA_USERNAME } from "../entities/Usuario.js";
import { Rol } from "../entities/enums.js";
import { hashPassword } from "../auth/password.js";
import { AppError } from "../errors/AppError.js";
import { violacionUnica } from "../errors/dbErrors.js";

export interface UsuarioDto {
  id: string;
  username: string;
  nombre: string;
  cargo: string | null;
  email: string;
  rol: Rol;
  activo: boolean;
  mustChangePassword: boolean;
  creadoEn: Date;
  actualizadoEn: Date;
}

// Campo a campo: nunca se serializa la entidad completa.
export function toUsuarioDto(u: Usuario): UsuarioDto {
  return {
    id: u.id,
    username: u.username,
    nombre: u.nombre,
    cargo: u.cargo,
    email: u.email,
    rol: u.rol,
    activo: u.activo,
    mustChangePassword: u.mustChangePassword,
    creadoEn: u.creadoEn,
    actualizadoEn: u.actualizadoEn,
  };
}

// 2627/2601 = violación de unicidad. Se atrapa el error de la BD (y no un chequeo previo) porque
// es lo único que resiste a dos altas simultáneas. El mensaje del motor nombra el constraint.
function conflictoUnico(err: unknown): AppError | null {
  const unica = violacionUnica(err);
  if (!unica) return null;
  const campo = unica.mensaje.includes("uq_usuario_email") ? "email" : "username";
  return new AppError(409, "CONFLICT", `Ya existe un usuario con ese ${campo}`);
}

export async function listarUsuarios(): Promise<UsuarioDto[]> {
  const usuarios = await AppDataSource.getRepository(Usuario).find({ order: { username: "ASC" } });
  return usuarios.map(toUsuarioDto);
}

export async function crearUsuario(input: {
  username: string;
  nombre: string;
  cargo?: string | null | undefined;
  email: string;
  password: string;
  rol: Rol;
}): Promise<UsuarioDto> {
  if (input.username === SISTEMA_USERNAME) {
    throw new AppError(409, "CONFLICT", "Ese nombre de usuario está reservado");
  }
  const repo = AppDataSource.getRepository(Usuario);
  const usuario = repo.create({
    username: input.username,
    nombre: input.nombre,
    cargo: input.cargo ?? null,
    email: input.email,
    passwordHash: await hashPassword(input.password),
    rol: input.rol,
    // El admin conoce la contraseña inicial: debe cambiarla al primer ingreso.
    mustChangePassword: true,
  });
  try {
    await repo.save(usuario);
  } catch (err) {
    throw conflictoUnico(err) ?? err;
  }
  return toUsuarioDto(usuario);
}

export async function actualizarUsuario(
  actorId: string,
  id: string,
  cambios: {
    nombre?: string | undefined;
    cargo?: string | null | undefined;
    email?: string | undefined;
    rol?: Rol | undefined;
    activo?: boolean | undefined;
    password?: string | undefined;
  },
): Promise<UsuarioDto> {
  const repo = AppDataSource.getRepository(Usuario);
  const usuario = await repo.findOneBy({ id });
  if (!usuario) throw new AppError(404, "NOT_FOUND", "Usuario no encontrado");

  if (usuario.username === SISTEMA_USERNAME) {
    throw new AppError(403, "FORBIDDEN", "El usuario de sistema no se puede modificar");
  }
  // Evita que el último admin se deje a sí mismo sin acceso.
  if (id === actorId && (cambios.activo === false || (cambios.rol !== undefined && cambios.rol !== Rol.ADMIN))) {
    throw new AppError(409, "CONFLICT", "No puedes desactivarte ni quitarte el rol admin a ti mismo");
  }

  if (cambios.nombre !== undefined) usuario.nombre = cambios.nombre;
  if (cambios.cargo !== undefined) usuario.cargo = cambios.cargo;
  if (cambios.email !== undefined) usuario.email = cambios.email;
  if (cambios.rol !== undefined) usuario.rol = cambios.rol;
  if (cambios.activo !== undefined) usuario.activo = cambios.activo;
  if (cambios.password !== undefined) {
    usuario.passwordHash = await hashPassword(cambios.password);
    usuario.mustChangePassword = true;
  }

  try {
    await repo.save(usuario);
  } catch (err) {
    throw conflictoUnico(err) ?? err;
  }
  return toUsuarioDto(usuario);
}
