import { AppDataSource } from "../config/dataSource.js";
import { env } from "../config/env.js";
import { CanalTicket } from "../entities/CanalTicket.js";
import { CuentaPortal } from "../entities/CuentaPortal.js";
import { EstadoTicket } from "../entities/EstadoTicket.js";
import { Prioridad } from "../entities/Prioridad.js";
import { Usuario } from "../entities/Usuario.js";
import { Rol } from "../entities/enums.js";
import { hashPassword } from "../auth/password.js";
import { signToken } from "../auth/jwt.js";
import { _resetCacheUsuarioSistemaParaTests } from "../services/usuarioSistema.service.js";

// Tablas con semilla de la migración: no se vacían (folio_counter se restablece aparte).
const CON_SEMILLA = ["folio_counter", "calendario_laboral", "migrations"];

// Hijos antes que padres (los FK de SQL Server impiden TRUNCATE de tablas referenciadas, así que
// se usa DELETE). evento es la excepción: su trigger rechaza DELETE, y como nadie la referencia
// sí admite TRUNCATE (que no dispara triggers).
//
// Fase C: prioridad/estado_ticket/canal_ticket pasan a ser obligatorios (FK NOT NULL desde
// ticket/ot con ON DELETE NO ACTION): deben ir DESPUÉS de ot, ticket y tema_ayuda (que las
// referencian). plan_sla es a su vez "padre" de prioridad (prioridad.plan_sla_id, ON DELETE SET
// NULL — el orden no es estrictamente obligatorio ahí, pero se mantiene el mismo criterio
// "hijos antes que padres" del resto de la lista): se mueve de su posición anterior a justo
// después de prioridad. Las 4 se re-siembran después del loop de limpieza (ver más abajo), ya que
// a diferencia de las demás tablas de este bloque no pueden quedar vacías entre tests.
const ORDEN_LIMPIEZA = [
  // Fase D: sin FK hacia/desde ninguna otra tabla, puede ir en cualquier posición de la lista.
  "cuenta_portal",
  "correo_saliente",
  "correo_ingerido",
  "mailbox_cursor",
  "configuracion_correo",
  "plantilla_correo",
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
  "tema_ayuda",
  "prioridad",
  "plan_sla",
  "estado_ticket",
  "canal_ticket",
  "cliente",
  "usuario",
  "departamento",
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
  // usuario se acaba de vaciar: el id de 'sistema' que services/usuarioSistema.service.ts cachea
  // en memoria (pensado para un proceso de producción donde esa fila nunca cambia) quedaría
  // apuntando a una fila borrada. Se invalida aquí, el único lugar que la borra.
  _resetCacheUsuarioSistemaParaTests();
  await AppDataSource.query(
    "UPDATE folio_counter SET ultimo = CASE serie WHEN 'TK' THEN 0 WHEN 'OT' THEN 1040 WHEN 'COT' THEN 2040 END",
  );

  // prioridad/plan_sla/estado_ticket/canal_ticket están en ORDEN_LIMPIEZA (SÍ se truncan, a
  // diferencia de sla_config antes): a diferencia del resto de esa lista, no pueden quedar vacías
  // entre tests (FK NOT NULL desde ticket/ot). Se re-siembran aquí con EXACTAMENTE las mismas filas
  // que sembró la migración 1790500000000-CatalogosTicketFaseC.ts (mismos nombres/flags literales),
  // para que los tests puedan resolverlas por nombre vía obtenerXPorNombre() más abajo.
  await AppDataSource.query(`
    INSERT INTO plan_sla (nombre, horas_resolucion, horas_primera_respuesta, usar_horas_habiles, pausar_en_espera_cliente, umbral_por_vencer) VALUES
      (N'Alta',  24, 2,  1, 1, 0.20),
      (N'Media', 48, 8,  1, 1, 0.20),
      (N'Baja', 120, 24, 1, 1, 0.20)`);
  await AppDataSource.query(`
    INSERT INTO prioridad (nombre, orden, plan_sla_id) VALUES
      (N'Alta',  1, (SELECT id FROM plan_sla WHERE nombre = N'Alta')),
      (N'Media', 2, (SELECT id FROM plan_sla WHERE nombre = N'Media')),
      (N'Baja',  3, (SELECT id FROM plan_sla WHERE nombre = N'Baja'))`);
  await AppDataSource.query(`
    INSERT INTO estado_ticket
      (nombre, orden, es_estado_inicial, es_destino_reapertura, es_pausa_sla, marca_resuelto_en, marca_cerrado_en, es_terminal)
    VALUES
      (N'Nuevo',              1, 1, 0, 0, 0, 0, 0),
      (N'Abierto',            2, 0, 1, 0, 0, 0, 0),
      (N'Esperando cliente',  3, 0, 0, 1, 0, 0, 0),
      (N'Resuelto',           4, 0, 0, 0, 1, 0, 1),
      (N'Cerrado',            5, 0, 0, 0, 0, 1, 1)`);
  await AppDataSource.query(`
    INSERT INTO canal_ticket (nombre, orden, es_manual, origen_ot_equivalente) VALUES
      (N'Portal',     1, 0, 'mesa_ayuda'),
      (N'Correo',     2, 0, 'correo'),
      (N'Teléfono',   3, 1, 'telefono'),
      (N'Presencial', 4, 1, 'presencial'),
      (N'Interno',    5, 1, 'interna')`);
}

// Helpers para que los tests sigan siendo legibles ("Alta"/"Nuevo"/"Portal") sin hardcodear uuids
// (que cambian en cada limpiarBD(), al re-sembrarse con NEWID()). Fase C.
export async function obtenerPrioridadPorNombre(nombre: string): Promise<Prioridad> {
  return AppDataSource.getRepository(Prioridad).findOneByOrFail({ nombre });
}

export async function obtenerEstadoTicketPorNombre(nombre: string): Promise<EstadoTicket> {
  return AppDataSource.getRepository(EstadoTicket).findOneByOrFail({ nombre });
}

export async function obtenerCanalTicketPorNombre(nombre: string): Promise<CanalTicket> {
  return AppDataSource.getRepository(CanalTicket).findOneByOrFail({ nombre });
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

// El usuario 'sistema' lo siembra scripts/seed.ts (Fase 0) en un entorno real; la suite de tests
// nunca lo corre (globalSetup.ts solo migra), así que cada test que ejercite el portal público
// debe crearlo primero (igual que usuario.routes.test.ts ya hace para sus propios casos).
export async function crearUsuarioSistemaTest(): Promise<Usuario> {
  const { usuario } = await crearUsuarioTest(Rol.LECTURA, { username: "sistema", activo: false });
  return usuario;
}

// Cuenta de portal (Fase D) creada directo en BD (evita pasar por /publico/cuentas/registro en
// cada test); útil sobre todo para el caso `activo:false`, que la API pública no puede producir
// (no hay endpoint de admin para desactivar una cuenta en esta fase).
export async function crearCuentaPortalTest(
  opciones: { email?: string; password?: string; nombre?: string; activo?: boolean } = {},
): Promise<{ cuenta: CuentaPortal; password: string }> {
  const email = opciones.email ?? "cliente-test@test.local";
  const password = opciones.password ?? "Password-de-test-1";
  const repo = AppDataSource.getRepository(CuentaPortal);
  const cuenta = await repo.save(
    repo.create({
      email,
      passwordHash: await hashPassword(password),
      nombre: opciones.nombre ?? "Cliente de prueba",
      activo: opciones.activo ?? true,
    }),
  );
  return { cuenta, password };
}
