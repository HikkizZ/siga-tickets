import type { NextFunction, Request, Response } from "express";
import { shouldRenew, signToken, verifyToken } from "../auth/jwt.js";
import { AppDataSource } from "../config/dataSource.js";
import { Usuario } from "../entities/Usuario.js";
import { AppError } from "../errors/AppError.js";

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) throw new AppError(401, "UNAUTHENTICATED", "Token no proporcionado");

  let payload: ReturnType<typeof verifyToken>;
  try {
    payload = verifyToken(token);
  } catch {
    throw new AppError(401, "INVALID_TOKEN", "Token inválido o expirado");
  }

  // Se consulta la BD en cada petición (son ~8 usuarios): con la renovación deslizante de
  // abajo, un usuario desactivado seguiría renovando su token para siempre, y un cambio
  // de rol no tendría efecto hasta que el token expirara.
  const usuario = await AppDataSource.getRepository(Usuario).findOne({
    where: { id: payload.sub },
    select: { id: true, username: true, rol: true, activo: true },
  });
  if (!usuario || !usuario.activo) throw new AppError(401, "INVALID_TOKEN", "Token inválido o expirado");

  req.user = { id: usuario.id, username: usuario.username, rol: usuario.rol };

  if (shouldRenew(payload.exp)) {
    res.setHeader("X-Renewed-Token", signToken({ sub: usuario.id, username: usuario.username, rol: usuario.rol }));
  }

  next();
}
