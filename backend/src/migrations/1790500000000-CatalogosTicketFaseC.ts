import type { MigrationInterface, QueryRunner } from "typeorm";

// Fase C: Prioridad, Estado y Canal (Fuente) de Ticket dejan de ser enums fijos con CHECK y pasan a
// catálogos administrables (nuevas tablas prioridad / estado_ticket / canal_ticket). Alcance
// deliberadamente acotado a lo pedido: EstadoOt (el kanban de 6 columnas) NO cambia en esta fase.
//
// Consolidación de SLA (decidida junto al usuario antes de esta fase): sla_config (3 filas fijas
// por prioridad, es lo que de verdad calculaba vencimientos) se retira. Sus valores reales de la
// BD de producción se migran a plan_sla (Fase B2, hasta ahora un catálogo sin conexión real), y
// cada fila de `prioridad` queda enlazada a un plan vía plan_sla_id. Los valores insertados abajo
// para plan_sla/prioridad son los que tenía sla_config en la BD real al momento de esta migración
// (alta 24h/2h, media 48h/8h —ya editado por el admin desde el default de siembra original de
// 72h/8h—, baja 120h/24h), no los defaults originales de EsquemaInicial.
//
// Estrategia por columna (ticket.canal/prioridad/estado, ot.prioridad, tema_ayuda.prioridad_sugerida):
// 1) crear catálogos + sembrar preservando exactamente el orden/semántica actual
// 2) agregar columna *_id nullable, 3) backfill por valor, 4) volver NOT NULL donde corresponde y
// agregar FK, 5) recién ahí borrar la columna vieja (con su CHECK, su DEFAULT si tiene, y los
// índices que la referencian) y recrear los índices sobre la columna nueva.
//
// Nota SQL Server: los índices filtrados (idx_ticket_responsable_abierto, idx_ticket_sla_abierto)
// solo admiten predicados contra constantes, no contra un JOIN a otra tabla — con "terminal" ahora
// viviendo en estado_ticket.es_terminal ya no se puede expresar como índice filtrado. Se recrean
// como índices normales; el volumen real (8 tickets) hace este costo irrelevante.
export class CatalogosTicketFaseC1790500000000 implements MigrationInterface {
  name = "CatalogosTicketFaseC1790500000000";

  public async up(q: QueryRunner): Promise<void> {
    // ---------- 1. Catálogos nuevos ----------
    await q.query(`
      CREATE TABLE prioridad (
        id             uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWID(),
        nombre         nvarchar(60) NOT NULL UNIQUE,
        orden          int      NOT NULL DEFAULT 0,
        activo         bit      NOT NULL DEFAULT 1,
        plan_sla_id    uniqueidentifier REFERENCES plan_sla(id) ON DELETE SET NULL,
        creado_en      datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        actualizado_en datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET()
      )`);

    await q.query(`
      CREATE TABLE estado_ticket (
        id                     uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWID(),
        nombre                 nvarchar(60) NOT NULL UNIQUE,
        orden                  int NOT NULL DEFAULT 0,
        activo                 bit NOT NULL DEFAULT 1,
        es_estado_inicial      bit NOT NULL DEFAULT 0,
        es_destino_reapertura  bit NOT NULL DEFAULT 0,
        es_pausa_sla           bit NOT NULL DEFAULT 0,
        marca_resuelto_en      bit NOT NULL DEFAULT 0,
        marca_cerrado_en       bit NOT NULL DEFAULT 0,
        es_terminal            bit NOT NULL DEFAULT 0,
        creado_en              datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        actualizado_en         datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET()
      )`);

    await q.query(`
      CREATE TABLE canal_ticket (
        id                     uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWID(),
        nombre                 nvarchar(60) NOT NULL UNIQUE,
        orden                  int NOT NULL DEFAULT 0,
        activo                 bit NOT NULL DEFAULT 1,
        es_manual              bit NOT NULL DEFAULT 0,
        origen_ot_equivalente  nvarchar(20) NOT NULL,
        creado_en              datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        actualizado_en         datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT canal_ticket_origen_check CHECK (origen_ot_equivalente IN ('mesa_ayuda','correo','telefono','presencial','interna'))
      )`);

    // ---------- 2. Semilla: plan_sla desde los valores REALES de sla_config ----------
    await q.query(`
      INSERT INTO plan_sla (nombre, horas_resolucion, horas_primera_respuesta, usar_horas_habiles, pausar_en_espera_cliente, umbral_por_vencer) VALUES
        (N'Alta',  24, 2,  1, 1, 0.20),
        (N'Media', 48, 8,  1, 1, 0.20),
        (N'Baja', 120, 24, 1, 1, 0.20)`);

    await q.query(`
      INSERT INTO prioridad (nombre, orden, plan_sla_id) VALUES
        (N'Alta',  1, (SELECT id FROM plan_sla WHERE nombre = N'Alta')),
        (N'Media', 2, (SELECT id FROM plan_sla WHERE nombre = N'Media')),
        (N'Baja',  3, (SELECT id FROM plan_sla WHERE nombre = N'Baja'))`);

    await q.query(`
      INSERT INTO estado_ticket
        (nombre, orden, es_estado_inicial, es_destino_reapertura, es_pausa_sla, marca_resuelto_en, marca_cerrado_en, es_terminal)
      VALUES
        (N'Nuevo',              1, 1, 0, 0, 0, 0, 0),
        (N'Abierto',            2, 0, 1, 0, 0, 0, 0),
        (N'Esperando cliente',  3, 0, 0, 1, 0, 0, 0),
        (N'Resuelto',           4, 0, 0, 0, 1, 0, 1),
        (N'Cerrado',            5, 0, 0, 0, 0, 1, 1)`);

    await q.query(`
      INSERT INTO canal_ticket (nombre, orden, es_manual, origen_ot_equivalente) VALUES
        (N'Portal',     1, 0, 'mesa_ayuda'),
        (N'Correo',     2, 0, 'correo'),
        (N'Teléfono',   3, 1, 'telefono'),
        (N'Presencial', 4, 1, 'presencial'),
        (N'Interno',    5, 1, 'interna')`);

    // ---------- 3. Columnas *_id nuevas (nullable hasta el backfill) ----------
    await q.query(`ALTER TABLE ticket ADD canal_id uniqueidentifier NULL`);
    await q.query(`ALTER TABLE ticket ADD prioridad_id uniqueidentifier NULL`);
    await q.query(`ALTER TABLE ticket ADD estado_id uniqueidentifier NULL`);
    await q.query(`ALTER TABLE ot ADD prioridad_id uniqueidentifier NULL`);
    await q.query(`ALTER TABLE tema_ayuda ADD prioridad_sugerida_id uniqueidentifier NULL`);

    // ---------- 4. Backfill desde el valor string viejo ----------
    await q.query(`
      UPDATE t SET canal_id = ct.id
      FROM ticket t JOIN canal_ticket ct ON ct.nombre = CASE t.canal
        WHEN 'portal' THEN N'Portal' WHEN 'correo' THEN N'Correo' WHEN 'telefono' THEN N'Teléfono'
        WHEN 'presencial' THEN N'Presencial' WHEN 'interno' THEN N'Interno' END`);

    await q.query(`
      UPDATE t SET prioridad_id = p.id
      FROM ticket t JOIN prioridad p ON p.nombre = CASE t.prioridad
        WHEN 'alta' THEN N'Alta' WHEN 'media' THEN N'Media' WHEN 'baja' THEN N'Baja' END`);

    await q.query(`
      UPDATE t SET estado_id = e.id
      FROM ticket t JOIN estado_ticket e ON e.nombre = CASE t.estado
        WHEN 'nuevo' THEN N'Nuevo' WHEN 'abierto' THEN N'Abierto' WHEN 'esperando_cliente' THEN N'Esperando cliente'
        WHEN 'resuelto' THEN N'Resuelto' WHEN 'cerrado' THEN N'Cerrado' END`);

    await q.query(`
      UPDATE o SET prioridad_id = p.id
      FROM ot o JOIN prioridad p ON p.nombre = CASE o.prioridad
        WHEN 'alta' THEN N'Alta' WHEN 'media' THEN N'Media' WHEN 'baja' THEN N'Baja' END`);

    await q.query(`
      UPDATE ta SET prioridad_sugerida_id = p.id
      FROM tema_ayuda ta JOIN prioridad p ON p.nombre = CASE ta.prioridad_sugerida
        WHEN 'alta' THEN N'Alta' WHEN 'media' THEN N'Media' WHEN 'baja' THEN N'Baja' END
      WHERE ta.prioridad_sugerida IS NOT NULL`);

    // ---------- 5. Índices viejos que referencian las columnas a borrar (deben caer antes) ----------
    await q.query(`DROP INDEX idx_ticket_estado_prioridad ON ticket`);
    await q.query(`DROP INDEX idx_ticket_responsable_abierto ON ticket`);
    await q.query(`DROP INDEX idx_ticket_sla_abierto ON ticket`);
    await q.query(`DROP INDEX idx_ot_estado_prioridad_ingreso ON ot`);

    // ---------- 6. CHECKs viejos ----------
    await q.query(`ALTER TABLE ticket DROP CONSTRAINT ticket_canal_check`);
    await q.query(`ALTER TABLE ticket DROP CONSTRAINT ticket_prioridad_check`);
    await q.query(`ALTER TABLE ticket DROP CONSTRAINT ticket_estado_check`);
    await q.query(`ALTER TABLE ot DROP CONSTRAINT ot_prioridad_check`);
    await q.query(`ALTER TABLE tema_ayuda DROP CONSTRAINT tema_ayuda_prioridad_check`);

    // ticket.estado tiene DEFAULT 'nuevo' sin nombre explícito (SQL Server le puso un nombre
    // autogenerado tipo DF__ticket__estado__...): hay que encontrarlo y borrarlo antes de poder
    // borrar la columna. Las demás columnas de este grupo no tienen DEFAULT.
    await q.query(`
      DECLARE @df sysname;
      SELECT @df = dc.name FROM sys.default_constraints dc
        JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
      WHERE dc.parent_object_id = OBJECT_ID('ticket') AND c.name = 'estado';
      IF @df IS NOT NULL EXEC('ALTER TABLE ticket DROP CONSTRAINT [' + @df + ']');
    `);

    // ---------- 7. Borrar columnas viejas ----------
    await q.query(`ALTER TABLE ticket DROP COLUMN canal`);
    await q.query(`ALTER TABLE ticket DROP COLUMN prioridad`);
    await q.query(`ALTER TABLE ticket DROP COLUMN estado`);
    await q.query(`ALTER TABLE ot DROP COLUMN prioridad`);
    await q.query(`ALTER TABLE tema_ayuda DROP COLUMN prioridad_sugerida`);

    // ---------- 8. NOT NULL + FK en las columnas nuevas ----------
    await q.query(`ALTER TABLE ticket ALTER COLUMN canal_id uniqueidentifier NOT NULL`);
    await q.query(`ALTER TABLE ticket ADD CONSTRAINT fk_ticket_canal FOREIGN KEY (canal_id) REFERENCES canal_ticket(id)`);
    await q.query(`ALTER TABLE ticket ALTER COLUMN prioridad_id uniqueidentifier NOT NULL`);
    await q.query(`ALTER TABLE ticket ADD CONSTRAINT fk_ticket_prioridad FOREIGN KEY (prioridad_id) REFERENCES prioridad(id)`);
    await q.query(`ALTER TABLE ticket ALTER COLUMN estado_id uniqueidentifier NOT NULL`);
    await q.query(`ALTER TABLE ticket ADD CONSTRAINT fk_ticket_estado FOREIGN KEY (estado_id) REFERENCES estado_ticket(id)`);
    await q.query(`ALTER TABLE ot ALTER COLUMN prioridad_id uniqueidentifier NOT NULL`);
    await q.query(`ALTER TABLE ot ADD CONSTRAINT fk_ot_prioridad FOREIGN KEY (prioridad_id) REFERENCES prioridad(id)`);
    await q.query(`ALTER TABLE tema_ayuda ADD CONSTRAINT fk_tema_ayuda_prioridad_sugerida FOREIGN KEY (prioridad_sugerida_id) REFERENCES prioridad(id) ON DELETE SET NULL`);

    // ---------- 9. Recrear índices sobre las columnas nuevas ----------
    await q.query(`CREATE INDEX idx_ticket_estado_prioridad ON ticket (estado_id, prioridad_id)`);
    await q.query(`CREATE INDEX idx_ticket_responsable_abierto ON ticket (responsable_actual_id, estado_id)`);
    await q.query(`CREATE INDEX idx_ticket_sla_abierto ON ticket (estado_id, sla_estado, sla_resolucion_vence_en)`);
    await q.query(`CREATE INDEX idx_ot_estado_prioridad_ingreso ON ot (estado, prioridad_id, fecha_ingreso DESC)`);

    // ---------- 10. sla_config queda reemplazado por prioridad.plan_sla_id -> plan_sla ----------
    await q.query(`DROP TABLE sla_config`);
  }

  public async down(q: QueryRunner): Promise<void> {
    // Reversión estructural best-effort: cualquier prioridad/estado/canal que el admin haya
    // agregado DESPUÉS de esta migración (que es justo el propósito de la Fase C) no tiene un
    // valor de enum original al cual volver, así que colapsa a un valor por defecto razonable
    // (baja / abierto / interno) en vez de fallar. El respaldo tomado antes de aplicar esta
    // migración (ver docs/backend-diseno.md, Fase C) es la vía real de rollback si hace falta
    // recuperar el estado exacto anterior.
    await q.query(`
      CREATE TABLE sla_config (
        prioridad                nvarchar(10) PRIMARY KEY,
        horas_resolucion         int      NOT NULL,
        horas_primera_respuesta  int      NOT NULL,
        usar_horas_habiles       bit      NOT NULL DEFAULT 1,
        pausar_en_espera_cliente bit      NOT NULL DEFAULT 1,
        umbral_por_vencer        decimal(3,2) NOT NULL DEFAULT 0.20,
        CONSTRAINT sla_config_prioridad_check CHECK (prioridad IN ('alta','media','baja')),
        CONSTRAINT sla_config_horas_check CHECK (horas_resolucion >= 0 AND horas_primera_respuesta >= 0)
      )`);
    await q.query(`
      INSERT INTO sla_config (prioridad, horas_resolucion, horas_primera_respuesta) VALUES
        ('alta', 24, 2), ('media', 72, 8), ('baja', 120, 24)`);

    await q.query(`ALTER TABLE ticket ADD canal nvarchar(20) NULL`);
    await q.query(`ALTER TABLE ticket ADD prioridad nvarchar(10) NULL`);
    await q.query(`ALTER TABLE ticket ADD estado nvarchar(20) NULL`);
    await q.query(`ALTER TABLE ot ADD prioridad nvarchar(10) NULL`);
    await q.query(`ALTER TABLE tema_ayuda ADD prioridad_sugerida nvarchar(10) NULL`);

    await q.query(`
      UPDATE t SET canal = ISNULL(
        (SELECT CASE ct.nombre WHEN N'Portal' THEN 'portal' WHEN N'Correo' THEN 'correo' WHEN N'Teléfono' THEN 'telefono'
                WHEN N'Presencial' THEN 'presencial' WHEN N'Interno' THEN 'interno' END
         FROM canal_ticket ct WHERE ct.id = t.canal_id), 'interno')
      FROM ticket t`);
    await q.query(`
      UPDATE t SET prioridad = ISNULL(
        (SELECT CASE p.nombre WHEN N'Alta' THEN 'alta' WHEN N'Media' THEN 'media' WHEN N'Baja' THEN 'baja' END
         FROM prioridad p WHERE p.id = t.prioridad_id), 'baja')
      FROM ticket t`);
    await q.query(`
      UPDATE t SET estado = ISNULL(
        (SELECT CASE e.nombre WHEN N'Nuevo' THEN 'nuevo' WHEN N'Abierto' THEN 'abierto' WHEN N'Esperando cliente' THEN 'esperando_cliente'
                WHEN N'Resuelto' THEN 'resuelto' WHEN N'Cerrado' THEN 'cerrado' END
         FROM estado_ticket e WHERE e.id = t.estado_id), 'abierto')
      FROM ticket t`);
    await q.query(`
      UPDATE o SET prioridad = ISNULL(
        (SELECT CASE p.nombre WHEN N'Alta' THEN 'alta' WHEN N'Media' THEN 'media' WHEN N'Baja' THEN 'baja' END
         FROM prioridad p WHERE p.id = o.prioridad_id), 'baja')
      FROM ot o`);
    await q.query(`
      UPDATE ta SET prioridad_sugerida =
        (SELECT CASE p.nombre WHEN N'Alta' THEN 'alta' WHEN N'Media' THEN 'media' WHEN N'Baja' THEN 'baja' END
         FROM prioridad p WHERE p.id = ta.prioridad_sugerida_id)
      FROM tema_ayuda ta WHERE ta.prioridad_sugerida_id IS NOT NULL`);

    await q.query(`DROP INDEX idx_ticket_estado_prioridad ON ticket`);
    await q.query(`DROP INDEX idx_ticket_responsable_abierto ON ticket`);
    await q.query(`DROP INDEX idx_ticket_sla_abierto ON ticket`);
    await q.query(`DROP INDEX idx_ot_estado_prioridad_ingreso ON ot`);

    await q.query(`ALTER TABLE tema_ayuda DROP CONSTRAINT fk_tema_ayuda_prioridad_sugerida`);
    await q.query(`ALTER TABLE ot DROP CONSTRAINT fk_ot_prioridad`);
    await q.query(`ALTER TABLE ticket DROP CONSTRAINT fk_ticket_estado`);
    await q.query(`ALTER TABLE ticket DROP CONSTRAINT fk_ticket_prioridad`);
    await q.query(`ALTER TABLE ticket DROP CONSTRAINT fk_ticket_canal`);

    await q.query(`ALTER TABLE tema_ayuda DROP COLUMN prioridad_sugerida_id`);
    await q.query(`ALTER TABLE ot DROP COLUMN prioridad_id`);
    await q.query(`ALTER TABLE ticket DROP COLUMN estado_id`);
    await q.query(`ALTER TABLE ticket DROP COLUMN prioridad_id`);
    await q.query(`ALTER TABLE ticket DROP COLUMN canal_id`);

    await q.query(`ALTER TABLE ticket ALTER COLUMN canal nvarchar(20) NOT NULL`);
    await q.query(`ALTER TABLE ticket ALTER COLUMN prioridad nvarchar(10) NOT NULL`);
    await q.query(`ALTER TABLE ticket ALTER COLUMN estado nvarchar(20) NOT NULL`);
    await q.query(`ALTER TABLE ticket ADD CONSTRAINT ticket_canal_check CHECK (canal IN ('portal','correo','telefono','presencial','interno'))`);
    await q.query(`ALTER TABLE ticket ADD CONSTRAINT ticket_prioridad_check CHECK (prioridad IN ('alta','media','baja'))`);
    await q.query(`ALTER TABLE ticket ADD CONSTRAINT ticket_estado_check CHECK (estado IN ('nuevo','abierto','esperando_cliente','resuelto','cerrado'))`);
    await q.query(`ALTER TABLE ticket ADD CONSTRAINT DF_ticket_estado DEFAULT 'nuevo' FOR estado`);

    await q.query(`ALTER TABLE ot ALTER COLUMN prioridad nvarchar(10) NOT NULL`);
    await q.query(`ALTER TABLE ot ADD CONSTRAINT ot_prioridad_check CHECK (prioridad IN ('alta','media','baja'))`);

    await q.query(`ALTER TABLE tema_ayuda ADD CONSTRAINT tema_ayuda_prioridad_check CHECK (prioridad_sugerida IS NULL OR prioridad_sugerida IN ('alta','media','baja'))`);

    await q.query(`CREATE INDEX idx_ticket_estado_prioridad ON ticket (estado, prioridad)`);
    await q.query(`CREATE INDEX idx_ticket_responsable_abierto ON ticket (responsable_actual_id) WHERE estado <> 'resuelto' AND estado <> 'cerrado'`);
    await q.query(`CREATE INDEX idx_ticket_sla_abierto ON ticket (sla_estado, sla_resolucion_vence_en) WHERE estado <> 'resuelto' AND estado <> 'cerrado'`);
    await q.query(`CREATE INDEX idx_ot_estado_prioridad_ingreso ON ot (estado, prioridad, fecha_ingreso DESC)`);

    await q.query(`DROP TABLE canal_ticket`);
    await q.query(`DROP TABLE estado_ticket`);
    await q.query(`DROP TABLE prioridad`);
  }
}
