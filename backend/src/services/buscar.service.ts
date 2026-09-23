import { AppDataSource } from "../config/dataSource.js";
import { escaparLike } from "./ot.service.js";

// GET /buscar: 4 ramas (OT, ticket, cotización, cliente) como consultas separadas combinadas en la
// aplicación, en vez de UNION ALL de 4 SELECT con columnas distintas — cada tipo devuelve una forma
// distinta (ver docs/api.md), así que un UNION ALL habría exigido rellenar columnas con NULL a
// mano y volver a discriminar el resultado en JS de todos modos; 4 queries separadas son igual de
// simples de mantener y más directas de tipar. Cada rama usa escaparLike (ya existe en
// ot.service.ts, reutilizada tal cual) y TOP 5. Sin paginación: es autocompletar, no un listado.
const LIMITE = 5;

interface FilaOt {
  id: string;
  numero: string;
  titulo: string;
  estado: string;
}
interface FilaTicket {
  id: string;
  numero: string;
  asunto: string;
  estado: string;
}
interface FilaCotizacion {
  id: string;
  numero: string;
  estado: string;
  monto_clp: string;
}
interface FilaCliente {
  id: string;
  nombre: string;
}

export interface BuscarDto {
  ots: Array<{ tipo: "ot"; id: string; numero: string; titulo: string; estado: string }>;
  tickets: Array<{ tipo: "ticket"; id: string; numero: string; asunto: string; estado: string }>;
  cotizaciones: Array<{ tipo: "cotizacion"; id: string; numero: string; estado: string; montoClp: number }>;
  clientes: Array<{ tipo: "cliente"; id: string; nombre: string }>;
}

export async function buscarGlobal(q: string): Promise<BuscarDto> {
  const like = `%${escaparLike(q)}%`;

  const [ots, tickets, cotizaciones, clientes] = await Promise.all([
    AppDataSource.query(
      `SELECT TOP ${LIMITE} id, numero, titulo, estado FROM ot
       WHERE numero LIKE @0 ESCAPE '\\' OR titulo LIKE @0 ESCAPE '\\'
       ORDER BY numero DESC`,
      [like],
    ) as Promise<FilaOt[]>,
    AppDataSource.query(
      `SELECT TOP ${LIMITE} id, numero, asunto, estado FROM ticket
       WHERE numero LIKE @0 ESCAPE '\\' OR asunto LIKE @0 ESCAPE '\\'
       ORDER BY numero DESC`,
      [like],
    ) as Promise<FilaTicket[]>,
    AppDataSource.query(
      `SELECT TOP ${LIMITE} id, numero, estado, monto_clp FROM cotizacion
       WHERE numero LIKE @0 ESCAPE '\\'
       ORDER BY numero DESC`,
      [like],
    ) as Promise<FilaCotizacion[]>,
    AppDataSource.query(
      `SELECT TOP ${LIMITE} id, nombre FROM cliente
       WHERE nombre LIKE @0 ESCAPE '\\'
       ORDER BY nombre ASC`,
      [like],
    ) as Promise<FilaCliente[]>,
  ]);

  return {
    ots: ots.map((o) => ({ tipo: "ot" as const, id: o.id.toLowerCase(), numero: o.numero, titulo: o.titulo, estado: o.estado })),
    tickets: tickets.map((t) => ({ tipo: "ticket" as const, id: t.id.toLowerCase(), numero: t.numero, asunto: t.asunto, estado: t.estado })),
    cotizaciones: cotizaciones.map((c) => ({
      tipo: "cotizacion" as const,
      id: c.id.toLowerCase(),
      numero: c.numero,
      estado: c.estado,
      montoClp: Number(c.monto_clp),
    })),
    clientes: clientes.map((c) => ({ tipo: "cliente" as const, id: c.id.toLowerCase(), nombre: c.nombre })),
  };
}
