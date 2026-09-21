import { AppDataSource } from "../config/dataSource.js";
import { Usuario, SISTEMA_USERNAME } from "../entities/Usuario.js";
import { comparePassword, hashPassword } from "../auth/password.js";
import { signToken } from "../auth/jwt.js";
import { AppError } from "../errors/AppError.js";
import { toUsuarioDto, type UsuarioDto } from "./usuario.service.js";

export async function login(username: string, password: string): Promise<{ token: string; user: UsuarioDto }> {
  const usuario = await AppDataSource.getRepository(Usuario)
    .createQueryBuilder("u")
    .addSelect("u.passwordHash")
    .where("u.username = :username", { username })
    .getOne();

  // Mismo error exista o no el usuario, esté activo o no, para no filtrar qué cuentas existen.
  // `sistema` nunca entra, aunque alguien lo active por error.
  if (
    !usuario ||
    !usuario.activo ||
    usuario.username === SISTEMA_USERNAME ||
    !(await comparePassword(password, usuario.passwordHash))
  ) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Credenciales inválidas");
  }

  const token = signToken({ sub: usuario.id, username: usuario.username, rol: usuario.rol });
  return { token, user: toUsuarioDto(usuario) };
}

export async function obtenerPerfil(userId: string): Promise<UsuarioDto> {
  const usuario = await AppDataSource.getRepository(Usuario).findOneBy({ id: userId });
  if (!usuario) throw new AppError(404, "NOT_FOUND", "Usuario no encontrado");
  return toUsuarioDto(usuario);
}

export async function cambiarPassword(userId: string, actual: string, nueva: string): Promise<void> {
  const repo = AppDataSource.getRepository(Usuario);
  const usuario = await repo
    .createQueryBuilder("u")
    .addSelect("u.passwordHash")
    .where("u.id = :id", { id: userId })
    .getOne();

  if (!usuario || !(await comparePassword(actual, usuario.passwordHash))) {
    // 403 y no 401: el usuario YA está autenticado y solo escribió mal su contraseña actual.
    // Un 401 haría que el frontend lo trate como sesión expirada y borre el token válido.
    throw new AppError(403, "WRONG_PASSWORD", "Contraseña actual incorrecta");
  }

  usuario.passwordHash = await hashPassword(nueva);
  usuario.mustChangePassword = false;
  await repo.save(usuario);
}
