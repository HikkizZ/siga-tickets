import type { MigrationInterface, QueryRunner } from "typeorm";

// Fase B1: dos catálogos nuevos administrables por un admin, aditivos (no reemplazan nada que ya
// funcione). departamento: catálogo simple de nombres, asignable opcionalmente a un usuario y a
// un tema de ayuda. tema_ayuda: catálogo inspirado en osTicket ("Help Topics"), asignable
// opcionalmente a un ticket (ticket.tema_ayuda_id) sin tocar categoria ni ningún comportamiento
// automático (sin conexión a OT ni a SLA en esta fase).
export class DepartamentosYTemasAyuda1790200000000 implements MigrationInterface {
  name = "DepartamentosYTemasAyuda1790200000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE departamento (
        id             uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWID(),
        nombre         nvarchar(120) NOT NULL UNIQUE,
        activo         bit      NOT NULL DEFAULT 1,
        creado_en      datetimeoffset(3)  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        actualizado_en datetimeoffset(3)  NOT NULL DEFAULT SYSDATETIMEOFFSET()
      )`);

    await q.query(`
      CREATE TABLE tema_ayuda (
        id                 uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWID(),
        nombre             nvarchar(120) NOT NULL UNIQUE,
        activo             bit      NOT NULL DEFAULT 1,
        es_publico         bit      NOT NULL DEFAULT 1,
        departamento_id    uniqueidentifier REFERENCES departamento(id) ON DELETE SET NULL,
        prioridad_sugerida nvarchar(10),
        orden              int      NOT NULL DEFAULT 0,
        creado_en          datetimeoffset(3)  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        actualizado_en     datetimeoffset(3)  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT tema_ayuda_prioridad_check CHECK (prioridad_sugerida IS NULL OR prioridad_sugerida IN ('alta','media','baja'))
      )`);

    // Metadata pura en usuario (0.4): no cambia ninguna lógica de permisos ni de ruteo existente.
    await q.query(`ALTER TABLE usuario ADD departamento_id uniqueidentifier REFERENCES departamento(id) ON DELETE SET NULL`);

    // Conexión aditiva en ticket: sin tocar categoria, sin conectarse a SLA en esta fase.
    await q.query(`ALTER TABLE ticket ADD tema_ayuda_id uniqueidentifier REFERENCES tema_ayuda(id) ON DELETE SET NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE ticket DROP COLUMN tema_ayuda_id`);
    await q.query(`ALTER TABLE usuario DROP COLUMN departamento_id`);
    await q.query(`DROP TABLE tema_ayuda`);
    await q.query(`DROP TABLE departamento`);
  }
}
