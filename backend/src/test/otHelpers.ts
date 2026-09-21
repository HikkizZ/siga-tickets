import request from "supertest";
import { app } from "../api/app.js";
import { signToken } from "../auth/jwt.js";
import { AppDataSource } from "../config/dataSource.js";
import { Cliente } from "../entities/Cliente.js";
import { Usuario } from "../entities/Usuario.js";
import { Rol } from "../entities/enums.js";

export interface Sesion {
  usuario: Usuario;
  auth: string;
}

// Usuario + JWT sin pasar por bcrypt (el hash es un relleno: estos usuarios nunca hacen login).
export async function crearSesionNombrada(rol: Rol, username: string, opciones: { activo?: boolean } = {}): Promise<Sesion> {
  const repo = AppDataSource.getRepository(Usuario);
  const usuario = await repo.save(
    repo.create({
      username,
      nombre: `Nombre ${username}`,
      cargo: null,
      email: `${username}@test.local`,
      passwordHash: "x".repeat(60),
      rol,
      activo: opciones.activo ?? true,
      mustChangePassword: false,
    }),
  );
  const token = signToken({ sub: usuario.id, username: usuario.username, rol: usuario.rol });
  return { usuario, auth: `Bearer ${token}` };
}

export async function crearClienteTest(nombre = "Cliente Test", activo = true): Promise<Cliente> {
  return AppDataSource.getRepository(Cliente).save({ nombre, activo });
}

export const otBody = (clienteId: string, extra: Record<string, unknown> = {}) => ({
  titulo: "Mantención de bomba",
  descripcion: "Revisar la bomba principal",
  clienteId,
  categoria: "mantencion",
  prioridad: "media",
  origen: "telefono",
  ...extra,
});

// Crea una OT por la API y devuelve el detalle.
export async function crearOtApi(auth: string, clienteId: string, extra: Record<string, unknown> = {}) {
  const res = await request(app).post("/api/v1/ots").set("Authorization", auth).send(otBody(clienteId, extra));
  if (res.status !== 201) throw new Error(`crearOtApi falló: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data as {
    id: string;
    numero: string;
    responsable: { id: string };
    cadenaResponsables: Array<{ id: string }>;
  };
}

export interface Escenario {
  admin: Sesion;
  gestion: Sesion;
  resp: Sesion; // tecnico responsable actual de la OT
  colab: Sesion; // tecnico colaborador
  ajeno: Sesion; // tecnico sin relación con la OT
  lectura: Sesion;
  extra: Sesion; // tecnico libre para usar de destino / nuevo colaborador
  cliente: Cliente;
  otId: string;
}

export async function crearEscenario(): Promise<Escenario> {
  const admin = await crearSesionNombrada(Rol.ADMIN, "admin_t");
  const gestion = await crearSesionNombrada(Rol.GESTION, "gestion_t");
  const resp = await crearSesionNombrada(Rol.TECNICO, "resp_t");
  const colab = await crearSesionNombrada(Rol.TECNICO, "colab_t");
  const ajeno = await crearSesionNombrada(Rol.TECNICO, "ajeno_t");
  const lectura = await crearSesionNombrada(Rol.LECTURA, "lectura_t");
  const extra = await crearSesionNombrada(Rol.TECNICO, "extra_t");
  const cliente = await crearClienteTest();
  const ot = await crearOtApi(admin.auth, cliente.id, { responsableId: resp.usuario.id, colaboradorIds: [colab.usuario.id] });
  return { admin, gestion, resp, colab, ajeno, lectura, extra, cliente, otId: ot.id };
}

export const API = "/api/v1";
