import type { MigrationInterface, QueryRunner } from "typeorm";

// Fase D: cuentas de cliente del portal público con login persistente, SUMADAS al flujo existente
// de número+correo (token de 15 min por ticket, ver 1789948800000-EsquemaInicial.ts) — no lo
// reemplazan. Tabla completamente independiente de usuario (staff interno): sin FK hacia/desde
// ella, nunca se mezcla con roles ni permisos internos.
export class CuentaPortal1790400000000 implements MigrationInterface {
  name = "CuentaPortal1790400000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE cuenta_portal (
        id             uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWID(),
        email          nvarchar(320) NOT NULL UNIQUE,
        password_hash  nvarchar(120) NOT NULL,
        nombre         nvarchar(120) NOT NULL,
        activo         bit      NOT NULL DEFAULT 1,
        creado_en      datetimeoffset(3)  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        actualizado_en datetimeoffset(3)  NOT NULL DEFAULT SYSDATETIMEOFFSET()
      )`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE cuenta_portal`);
  }
}
