import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppDataSource } from "../config/dataSource.js";
import { CorreoSaliente } from "../entities/CorreoSaliente.js";
import { Rol } from "../entities/enums.js";
import type { Mailer, MensajeSaliente } from "../mail/outbound/Mailer.js";
import { conectarBD, limpiarBD } from "../test/helpers.js";
import { crearSesionNombrada } from "../test/otHelpers.js";
import { procesarCorreoSaliente } from "./correoSalienteJob.js";

beforeAll(conectarBD);
beforeEach(limpiarBD);
afterAll(async () => {
  await AppDataSource.destroy();
});

function crearMailerFalso(): { mailer: Mailer; enviados: MensajeSaliente[] } {
  const enviados: MensajeSaliente[] = [];
  return { mailer: { enviar: async (msg) => void enviados.push(msg) }, enviados };
}

function crearMailerQueFalla(mensaje = "SMTP no disponible"): Mailer {
  return {
    enviar: async () => {
      throw new Error(mensaje);
    },
  };
}

async function insertarCorreoPendiente(overrides: Partial<Record<string, unknown>> = {}) {
  return AppDataSource.getRepository(CorreoSaliente).save({
    plantilla: "ticket_creado",
    para: "cliente@test.cl",
    asunto: "Asunto de prueba",
    cuerpoHtml: "<p>hola</p>",
    headers: { "Message-ID": "<abc@siga-ot.local>", "X-SIGA-Ticket": "TK-0001" },
    ...overrides,
  });
}

async function filaCorreo(id: string) {
  const [fila] = await AppDataSource.query(
    `SELECT estado, intentos, proximo_intento_en, error FROM correo_saliente WHERE id = @0`,
    [id],
  );
  return fila as { estado: string; intentos: number; proximo_intento_en: Date; error: string | null };
}

describe("procesarCorreoSaliente", () => {
  it("con un Mailer que funciona: pasa a 'enviado' y lo envía con el contenido correcto", async () => {
    const correo = await insertarCorreoPendiente();
    const { mailer, enviados } = crearMailerFalso();

    await procesarCorreoSaliente(mailer);

    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toEqual({
      para: "cliente@test.cl",
      asunto: "Asunto de prueba",
      cuerpoHtml: "<p>hola</p>",
      headers: { "Message-ID": "<abc@siga-ot.local>", "X-SIGA-Ticket": "TK-0001" },
    });
    const fila = await filaCorreo(correo.id);
    expect(fila.estado).toBe("enviado");
  });

  it("un correo ya 'enviado' no se vuelve a tomar en una pasada posterior", async () => {
    await insertarCorreoPendiente();
    const { mailer, enviados } = crearMailerFalso();

    await procesarCorreoSaliente(mailer);
    await procesarCorreoSaliente(mailer);

    expect(enviados).toHaveLength(1);
  });

  it("procesa varias filas pendientes en una sola pasada", async () => {
    await insertarCorreoPendiente({ para: "uno@test.cl" });
    await insertarCorreoPendiente({ para: "dos@test.cl" });
    const { mailer, enviados } = crearMailerFalso();

    await procesarCorreoSaliente(mailer);

    expect(enviados.map((m) => m.para).sort()).toEqual(["dos@test.cl", "uno@test.cl"]);
  });

  it("con un Mailer que falla: reintenta con backoff 2^intentos minutos y no queda 'enviado'", async () => {
    const correo = await insertarCorreoPendiente();
    const antes = new Date();

    await procesarCorreoSaliente(crearMailerQueFalla());

    const fila = await filaCorreo(correo.id);
    expect(fila.estado).toBe("pendiente");
    expect(Number(fila.intentos)).toBe(1);
    expect(fila.error).toContain("SMTP no disponible");
    const minutosHastaElProximo = (new Date(fila.proximo_intento_en).getTime() - antes.getTime()) / 60000;
    expect(minutosHastaElProximo).toBeGreaterThan(1.5); // 2^1 = 2 min, con margen
    expect(minutosHastaElProximo).toBeLessThan(3);
  });

  it("tras 5 intentos fallidos: pasa a 'fallido' y notifica in-app a los admin (no a otros roles)", async () => {
    const admin = await crearSesionNombrada(Rol.ADMIN, "admin_correo_job");
    await crearSesionNombrada(Rol.TECNICO, "tecnico_correo_job"); // no debe recibir la notificación
    const correo = await insertarCorreoPendiente();
    const mailerQueFalla = crearMailerQueFalla();

    for (let intento = 1; intento <= 5; intento++) {
      await procesarCorreoSaliente(mailerQueFalla);
      const fila = await filaCorreo(correo.id);
      if (intento < 5) {
        expect(fila.estado, `intento ${intento}`).toBe("pendiente");
        expect(Number(fila.intentos)).toBe(intento);
        // Adelanta el reloj a mano para no esperar el backoff real entre intentos del test.
        await AppDataSource.query(`UPDATE correo_saliente SET proximo_intento_en = SYSDATETIMEOFFSET() WHERE id = @0`, [correo.id]);
      } else {
        expect(fila.estado).toBe("fallido");
        expect(Number(fila.intentos)).toBe(5);
      }
    }

    const notifs: Array<{ usuario_id: string; tipo: string }> = await AppDataSource.query(
      `SELECT usuario_id, tipo FROM notificacion WHERE tipo = 'correo_fallido'`,
    );
    expect(notifs).toHaveLength(1);
    expect(notifs[0]!.usuario_id.toLowerCase()).toBe(admin.usuario.id.toLowerCase());
  });

  it("sin filas pendientes: no hace nada", async () => {
    const { mailer, enviados } = crearMailerFalso();
    await expect(procesarCorreoSaliente(mailer)).resolves.toBeUndefined();
    expect(enviados).toHaveLength(0);
  });
});
