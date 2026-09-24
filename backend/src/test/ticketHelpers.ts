import request from "supertest";
import { app } from "../api/app.js";
import { AppDataSource } from "../config/dataSource.js";
import { Cliente } from "../entities/Cliente.js";
import { Rol } from "../entities/enums.js";
import { obtenerCanalTicketPorNombre, obtenerPrioridadPorNombre } from "./helpers.js";
import { API, crearClienteTest, crearSesionNombrada, type Sesion } from "./otHelpers.js";

// Fase C: canal/prioridad ya no son valores de enum fijos ("telefono"/"media") sino catálogos con
// uuid; el body por defecto resuelve "Teléfono"/"Media" por nombre (mismas filas sembradas por la
// migración, ver test/helpers.ts::limpiarBD) para no hardcodear ids que cambian entre tests. Async
// a diferencia de la Fase B: hace falta consultar la BD para resolver esos ids.
export async function ticketBody(extra: Record<string, unknown> = {}) {
  const [canal, prioridad] = await Promise.all([obtenerCanalTicketPorNombre("Teléfono"), obtenerPrioridadPorNombre("Media")]);
  return {
    asunto: "No enciende el equipo",
    descripcion: "El PC de recepción no enciende",
    solicitanteNombre: "Juan Pérez",
    solicitanteEmail: "juan.perez@test.local",
    canalId: canal.id,
    prioridadId: prioridad.id,
    ...extra,
  };
}

export async function crearTicketApi(auth: string, extra: Record<string, unknown> = {}) {
  const res = await request(app)
    .post(`${API}/tickets`)
    .set("Authorization", auth)
    .send(await ticketBody(extra));
  if (res.status !== 201) throw new Error(`crearTicketApi falló: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data as {
    id: string;
    numero: string;
    estado: { id: string; nombre: string };
    canal: { id: string; nombre: string };
    responsable: { id: string } | null;
    recepcionadoPor: { id: string };
  };
}

export interface EscenarioTicket {
  admin: Sesion;
  gestion: Sesion;
  resp: Sesion; // tecnico responsable actual del ticket
  ajeno: Sesion; // tecnico sin relación con el ticket
  lectura: Sesion;
  extra: Sesion; // tecnico libre para usar de destino
  cliente: Cliente;
  ticketId: string;
  numero: string;
}

// Crea un ticket sin responsable y luego lo hace tomar por `resp`, para tener un escenario con
// responsable ya asignado (equivalente a crearEscenario() de otHelpers.ts, sin colaborador).
export async function crearEscenarioTicket(): Promise<EscenarioTicket> {
  const admin = await crearSesionNombrada(Rol.ADMIN, "admin_tk");
  const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_tk");
  const resp = await crearSesionNombrada(Rol.TECNICO, "resp_tk");
  const ajeno = await crearSesionNombrada(Rol.TECNICO, "ajeno_tk");
  const lectura = await crearSesionNombrada(Rol.LECTURA, "lectura_tk");
  const extra = await crearSesionNombrada(Rol.TECNICO, "extra_tk");
  const cliente = await crearClienteTest("Cliente Ticket Test");
  const t = await crearTicketApi(admin.auth);
  const tomado = await request(app).post(`${API}/tickets/${t.id}/tomar`).set("Authorization", resp.auth);
  if (tomado.status !== 200) throw new Error(`tomar en crearEscenarioTicket falló: ${tomado.status} ${JSON.stringify(tomado.body)}`);
  return { admin, gestion, resp, ajeno, lectura, extra, cliente, ticketId: t.id, numero: t.numero };
}

export async function tramosTicket(ticketId: string) {
  return (await AppDataSource.query(
    `SELECT usuario_id, desde, hasta, duracion_seg, motivo_entrada, derivado_por_id
     FROM asignacion WHERE entidad_tipo = 'ticket' AND entidad_id = @0 ORDER BY desde`,
    [ticketId],
  )) as Array<{
    usuario_id: string;
    desde: Date;
    hasta: Date | null;
    duracion_seg: number | null;
    motivo_entrada: string | null;
    derivado_por_id: string | null;
  }>;
}
