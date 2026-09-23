import type { MigrationInterface, QueryRunner } from "typeorm";

// Fase 6 (ingesta de correo): cursor de lectura del buzón, persistido entre reinicios del worker.
// Una fila por origen (MailboxSource.nombre()); sembrada vacía (la crea el primer
// procesarIngesta() con un MERGE). Mismo estilo minimalista que folio_counter.
export class MailboxCursor1790000000000 implements MigrationInterface {
  name = "MailboxCursor1790000000000";

  public async up(q: QueryRunner): Promise<void> {
    // [cursor] entre corchetes: CURSOR es palabra reservada de T-SQL (DECLARE CURSOR).
    await q.query(`
      CREATE TABLE mailbox_cursor (
        origen         nvarchar(60)  NOT NULL PRIMARY KEY,
        [cursor]       nvarchar(128) NOT NULL,
        actualizado_en datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET()
      )`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE mailbox_cursor`);
  }
}
