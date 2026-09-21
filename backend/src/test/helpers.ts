import { AppDataSource } from "../config/dataSource.js";
import { env } from "../config/env.js";
import { Usuario } from "../entities/Usuario.js";
import { Rol } from "../entities/enums.js";
import { hashPassword } from "../auth/password.js";
import { signToken } from "../auth/jwt.js";

// Tablas con semilla de la migración: no se vacían (folio_counter se restablece aparte).
const CON_SEMILLA = ["folio_counter", "sla_config", "calendario_laboral", "migrations"];

// Hijos antes que padres (los FK de SQL Server impiden TRUNCATE de tablas referenciadas, así que
// se usa DELETE). evento es la excepción: su trigger rechaza DELETE, y como nadie la referencia
// sí admite TRUNCATE (que no dispara triggers).
const ORDEN_LIMPIEZA = [
  "correo_saliente",
  "correo_ingerido",
  "sla_pausa",
  "feriado",
  "notificacion",
  "adjunto",
  "etapa_ot",
  "hora_trabajada",
  "comentario_ot",
  "ot_colaborador",
  "ticket_ot",
  "cotizacion",
  "mensaje_ticket",
  "evento",
  "asignacion",
  "ot",
  "ticket",
  "cliente",
  "usuario",
];

export async function conectarBD(): Promise<void> {
  if (!env.db.name.endsWith("-test")) throw new Error(`Los tests solo corren contra una BD *-test, no ${env.db.name}`);
  if (!AppDataSource.isInitialized) await AppDataSource.initialize();
}

export async function limpiarBD(): Promise<void> {
  const filas: Array<{ name: string }> = await AppDataSource.query("SELECT name FROM sys.tables");
  const existentes = filas.map((f) => f.name).filter((t) => !CON_SEMILLA.includes(t));
  const sinOrden = existentes.filter((t) => !ORDEN_LIMPIEZA.includes(t));
  if (sinOrden.length) throw new Error(`limpiarBD no conoce las tablas: ${sinOrden.join(", ")}`);

  for (const tabla of ORDEN_LIMPIEZA) {
    await AppDataSource.query(tabla === "evento" ? `TRUNCATE TABLE [evento]` : `DELETE FROM [${tabla}]`);
  }
  await AppDataSource.query(
    "UPDATE folio_counter SET ultimo = CASE serie WHEN 'TK' THEN 0 WHEN 'OT' THEN 1040 WHEN 'COT' THEN 2040 END",
  );
}

export async function crearUsuarioTest(
  rol: Rol,
  opciones: { username?: string; password?: string; activo?: boolean; mustChangePassword?: boolean } = {},
): Promise<{ usuario: Usuario; password: string }> {
  const username = opciones.username ?? `${rol}_test`;
  const password = opciones.password ?? "Password-de-test-1";
  const repo = AppDataSource.getRepository(Usuario);
  const usuario = await repo.save(
    repo.create({
      username,
      nombre: `Test ${username}`,
      cargo: null,
      email: `${username}@test.local`,
      passwordHash: await hashPassword(password),
      rol,
      activo: opciones.activo ?? true,
      mustChangePassword: opciones.mustChangePassword ?? false,
    }),
  );
  return { usuario, password };
}

// Usuario + JWT firmado directamente (evita pasar por /auth/login en cada test).
export async function crearSesion(rol: Rol): Promise<{ usuario: Usuario; auth: string }> {
  const { usuario } = await crearUsuarioTest(rol);
  const token = signToken({ sub: usuario.id, username: usuario.username, rol: usuario.rol });
  return { usuario, auth: `Bearer ${token}` };
}
