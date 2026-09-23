import type { MigrationInterface, QueryRunner } from "typeorm";

// Fase B2: dos catálogos nuevos, administrables por un admin.
// - plan_sla: Planes SLA con nombre propio (distinto de sla_config, que son 3 filas fijas por
//   prioridad). Sin FK desde ningún lado todavía (alcance acotado a propósito: no conectado al
//   cálculo real de SLA ni a OT/Ticket), así que admite DELETE real.
// - plantilla_correo: plantillas de correo editables, con fallback al texto fijo de
//   mail/outbound/plantillas.ts cuando no hay fila, o activa=0 (ver ese archivo).
export class PlanSlaYPlantillaCorreo1790300000000 implements MigrationInterface {
  name = "PlanSlaYPlantillaCorreo1790300000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE plan_sla (
        id                        uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWID(),
        nombre                    nvarchar(160) NOT NULL UNIQUE,
        activo                    bit      NOT NULL DEFAULT 1,
        horas_resolucion          int      NOT NULL,
        horas_primera_respuesta   int      NOT NULL,
        usar_horas_habiles        bit      NOT NULL DEFAULT 1,
        pausar_en_espera_cliente  bit      NOT NULL DEFAULT 1,
        umbral_por_vencer         decimal(3,2) NOT NULL DEFAULT 0.20,
        creado_en                 datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        actualizado_en            datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT plan_sla_horas_check CHECK (horas_resolucion >= 0 AND horas_primera_respuesta >= 0)
      )`);

    await q.query(`
      CREATE TABLE plantilla_correo (
        nombre              nvarchar(40) NOT NULL PRIMARY KEY,
        asunto               nvarchar(500) NOT NULL,
        cuerpo_html          nvarchar(max) NOT NULL,
        activa               bit NOT NULL DEFAULT 1,
        actualizado_en       datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        actualizado_por_id   uniqueidentifier REFERENCES usuario(id),
        CONSTRAINT plantilla_correo_nombre_check CHECK (nombre IN ('ticket_creado','aviso_soporte','respuesta_cliente'))
      )`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE plantilla_correo`);
    await q.query(`DROP TABLE plan_sla`);
  }
}
