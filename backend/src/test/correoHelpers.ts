import { randomUUID } from "node:crypto";
import type { CorreoEntrante, MailboxSource } from "../mail/ingest/MailboxSource.js";

// Fase 6: builder de un correo entrante falso (mismo espíritu que otBody/ticketBody), para no
// depender de un buzón IMAP real en los tests (el encargo lo exige explícitamente).
export function correoEntranteFake(overrides: Partial<CorreoEntrante> = {}): CorreoEntrante {
  return {
    messageId: `<${randomUUID()}@cliente.cl>`,
    inReplyTo: null,
    referencias: [],
    de: { nombre: "Juan Pérez", email: "juan.perez@cliente.cl" },
    para: ["soporte@sigaltda.cl"],
    asunto: "No enciende el equipo",
    texto: "El PC de recepción no enciende",
    html: null,
    adjuntos: [],
    recibidoEn: new Date(),
    cabeceras: {},
    ...overrides,
  };
}

export function adjuntoFake(overrides: Partial<{ nombre: string; mime: string; tamano: number; relleno: number }> = {}) {
  const tamano = overrides.tamano ?? 1024;
  return { nombre: overrides.nombre ?? "foto.jpg", mime: overrides.mime ?? "image/jpeg", buffer: Buffer.alloc(tamano, overrides.relleno ?? 1) };
}

// MailboxSource falsa e inyectable: cada llamada a fetchNuevos devuelve la siguiente "página"
// preparada por el test y registra el cursor que recibió (para poder afirmar que el job lo pasó
// correctamente entre dos llamadas). Sin páginas restantes, se comporta como NoopMailboxSource.
export function mailboxSourceFalsa(nombre: string, paginas: Array<{ mensajes: CorreoEntrante[]; cursor: string }>) {
  const cursoresRecibidos: Array<string | null> = [];
  let i = 0;
  const source: MailboxSource = {
    nombre: () => nombre,
    fetchNuevos: async (cursor) => {
      cursoresRecibidos.push(cursor);
      const pagina = paginas[i];
      i++;
      return pagina ?? { mensajes: [], cursor: cursor ?? "0" };
    },
  };
  return { source, cursoresRecibidos };
}
