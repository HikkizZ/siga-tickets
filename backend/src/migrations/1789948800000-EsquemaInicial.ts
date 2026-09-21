import type { MigrationInterface, QueryRunner } from "typeorm";

// Esquema completo de docs/backend-diseno.md sección 2.3 (modelo lógico) sobre SQL Server.
// Escrito a mano en T-SQL porque TypeORM no modela CHECK, índices filtrados, columnas
// calculadas ni triggers, y con synchronize:false lo que no esté aquí simplemente no existe.
// Un q.query() por sentencia: CREATE TRIGGER debe ir solo en su batch y no hay `GO`.
export class EsquemaInicial1789948800000 implements MigrationInterface {
  name = "EsquemaInicial1789948800000";

  public async up(q: QueryRunner): Promise<void> {
    // ---------- folios ----------
    await q.query(`
      CREATE TABLE folio_counter (
        serie  nvarchar(8) PRIMARY KEY,
        ultimo bigint   NOT NULL CHECK (ultimo >= 0),
        ancho  smallint NOT NULL CHECK (ancho > 0)
      )`);
    await q.query(`
      INSERT INTO folio_counter (serie, ultimo, ancho) VALUES
        ('TK', 0, 4), ('OT', 1040, 4), ('COT', 2040, 4)`);

    // ---------- usuario / cliente ----------
    await q.query(`
      CREATE TABLE usuario (
        id                   uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWID(),
        username             nvarchar(50)  NOT NULL CONSTRAINT uq_usuario_username UNIQUE,
        nombre               nvarchar(120) NOT NULL,
        cargo                nvarchar(80),
        email                nvarchar(160) NOT NULL CONSTRAINT uq_usuario_email UNIQUE,
        password_hash        nvarchar(120) NOT NULL,
        rol                  nvarchar(20)  NOT NULL,
        activo               bit      NOT NULL DEFAULT 1,
        must_change_password bit      NOT NULL DEFAULT 0,
        creado_en            datetimeoffset(3)  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        actualizado_en       datetimeoffset(3)  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT usuario_rol_check CHECK (rol IN ('admin','gestion','tecnico','lectura'))
      )`);
    await q.query(`
      CREATE TABLE cliente (
        id             uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWID(),
        nombre         nvarchar(160) NOT NULL UNIQUE,
        activo         bit      NOT NULL DEFAULT 1,
        creado_en      datetimeoffset(3)  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        actualizado_en datetimeoffset(3)  NOT NULL DEFAULT SYSDATETIMEOFFSET()
      )`);

    // ---------- ticket ----------
    await q.query(`
      CREATE TABLE ticket (
        id                       uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWID(),
        numero                   nvarchar(12)  NOT NULL UNIQUE,
        asunto                   nvarchar(200) NOT NULL,
        descripcion              nvarchar(max)         NOT NULL,
        solicitante_nombre       nvarchar(120) NOT NULL,
        solicitante_email        nvarchar(320) NOT NULL,
        solicitante_telefono     nvarchar(40),
        solicitante_empresa      nvarchar(160),
        cliente_id               uniqueidentifier REFERENCES cliente(id),
        canal                    nvarchar(20)  NOT NULL,
        prioridad                nvarchar(10)  NOT NULL,
        estado                   nvarchar(20)  NOT NULL DEFAULT 'nuevo',
        fecha_ingreso            datetimeoffset(3)  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        recepcionado_por_id      uniqueidentifier NOT NULL REFERENCES usuario(id),
        responsable_actual_id    uniqueidentifier REFERENCES usuario(id),
        primera_respuesta_en     datetimeoffset(3),
        resuelto_en              datetimeoffset(3),
        cerrado_en               datetimeoffset(3),
        sla_resolucion_vence_en  datetimeoffset(3),
        sla_respuesta_vence_en   datetimeoffset(3),
        sla_estado               nvarchar(12)  NOT NULL DEFAULT 'en_plazo',
        sla_pausado_desde        datetimeoffset(3),
        token_publico            uniqueidentifier NOT NULL CONSTRAINT uq_ticket_token_publico UNIQUE DEFAULT NEWID(),
        creado_en                datetimeoffset(3)  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        actualizado_en           datetimeoffset(3)  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT ticket_canal_check     CHECK (canal IN ('portal','correo','telefono','presencial','interno')),
        CONSTRAINT ticket_prioridad_check CHECK (prioridad IN ('alta','media','baja')),
        CONSTRAINT ticket_estado_check    CHECK (estado IN ('nuevo','abierto','esperando_cliente','resuelto','cerrado')),
        CONSTRAINT ticket_sla_estado_check CHECK (sla_estado IN ('en_plazo','por_vencer','vencida'))
      )`);
    await q.query(`CREATE INDEX idx_ticket_estado_prioridad ON ticket (estado, prioridad)`);
    await q.query(`
      CREATE INDEX idx_ticket_responsable_abierto ON ticket (responsable_actual_id)
      WHERE estado <> 'resuelto' AND estado <> 'cerrado'`);
    await q.query(`
      CREATE INDEX idx_ticket_sla_abierto ON ticket (sla_estado, sla_resolucion_vence_en)
      WHERE estado <> 'resuelto' AND estado <> 'cerrado'`);
    await q.query(`CREATE INDEX idx_ticket_solicitante_email ON ticket (solicitante_email)`);
    // La búsqueda global usará LIKE (sin Full-Text ni trigram). Para numero basta el índice
    // btree del UNIQUE; asunto/titulo se escanean (miles de filas).

    // ---------- ot ----------
    await q.query(`
      CREATE TABLE ot (
        id                       uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWID(),
        numero                   nvarchar(12)  NOT NULL UNIQUE,
        titulo                   nvarchar(200) NOT NULL,
        descripcion              nvarchar(max)         NOT NULL,
        cliente_id               uniqueidentifier REFERENCES cliente(id),
        area_interna             nvarchar(120),
        es_interna               bit      NOT NULL DEFAULT 0,
        categoria                nvarchar(20)  NOT NULL,
        prioridad                nvarchar(10)  NOT NULL,
        origen                   nvarchar(20)  NOT NULL,
        ubicacion                nvarchar(200),
        solicitante_nombre       nvarchar(120),
        solicitante_contacto     nvarchar(160),
        fecha_ingreso            datetimeoffset(3)  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        fecha_estimada_termino   date,
        estado                   nvarchar(20)  NOT NULL DEFAULT 'ingresado',
        recepcionado_por_id      uniqueidentifier NOT NULL REFERENCES usuario(id),
        responsable_actual_id    uniqueidentifier REFERENCES usuario(id),
        terminado_en             datetimeoffset(3),
        sla_resolucion_vence_en  datetimeoffset(3),
        sla_estado               nvarchar(12)  NOT NULL DEFAULT 'en_plazo',
        sla_pausado_desde        datetimeoffset(3),
        creado_en                datetimeoffset(3)  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        actualizado_en           datetimeoffset(3)  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT ot_interna_check CHECK (
          (es_interna = 1 AND area_interna IS NOT NULL AND cliente_id IS NULL)
          OR (es_interna = 0 AND cliente_id IS NOT NULL)
        ),
        CONSTRAINT ot_categoria_check CHECK (categoria IN ('mantencion','instalacion','reparacion','cotizacion','soporte','otro')),
        CONSTRAINT ot_prioridad_check CHECK (prioridad IN ('alta','media','baja')),
        CONSTRAINT ot_origen_check    CHECK (origen IN ('mesa_ayuda','correo','telefono','presencial','interna')),
        CONSTRAINT ot_estado_check    CHECK (estado IN ('ingresado','en_cotizacion','aprobado','en_ejecucion','terminado','facturado')),
        CONSTRAINT ot_sla_estado_check CHECK (sla_estado IN ('en_plazo','por_vencer','vencida'))
      )`);
    await q.query(`CREATE INDEX idx_ot_estado ON ot (estado)`);
    await q.query(`CREATE INDEX idx_ot_estado_prioridad_ingreso ON ot (estado, prioridad, fecha_ingreso DESC)`);
    await q.query(`
      CREATE INDEX idx_ot_responsable_abierta ON ot (responsable_actual_id)
      WHERE estado <> 'terminado' AND estado <> 'facturado'`);
    await q.query(`CREATE INDEX idx_ot_cliente ON ot (cliente_id)`);

    // ---------- asignacion ----------
    await q.query(`
      CREATE TABLE asignacion (
        id               uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWID(),
        entidad_tipo     nvarchar(10) NOT NULL,
        entidad_id       uniqueidentifier        NOT NULL,
        usuario_id       uniqueidentifier        NOT NULL REFERENCES usuario(id),
        desde            datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        hasta            datetimeoffset(3),
        motivo_entrada   nvarchar(max),
        derivado_por_id  uniqueidentifier REFERENCES usuario(id),
        duracion_seg     AS (DATEDIFF(SECOND, desde, hasta)) PERSISTED,
        CONSTRAINT asignacion_entidad_tipo_check CHECK (entidad_tipo IN ('ticket','ot')),
        CONSTRAINT asignacion_hasta_check CHECK (hasta IS NULL OR hasta > desde)
      )`);
    await q.query(`
      CREATE UNIQUE INDEX uq_asignacion_tramo_abierto ON asignacion (entidad_tipo, entidad_id)
      WHERE hasta IS NULL`);
    await q.query(`CREATE INDEX idx_asignacion_entidad_desde ON asignacion (entidad_tipo, entidad_id, desde)`);
    // Sustituye al EXCLUDE USING gist de PG: sin tramos solapados por (entidad_tipo, entidad_id).
    // AFTER porque necesita ver la fila ya escrita; el rango es [desde, hasta) y un tramo abierto
    // llega hasta el infinito. UPDLOCK+HOLDLOCK toman bloqueos de rango sobre
    // idx_asignacion_entidad_desde, así dos transacciones concurrentes no pueden colarse ambas.
    // El THROW dentro de un trigger deshace TODA la transacción en curso.
    await q.query(`
      CREATE TRIGGER trg_asignacion_sin_solape ON asignacion
      AFTER INSERT, UPDATE
      AS
      BEGIN
        SET NOCOUNT ON;
        IF EXISTS (
          SELECT 1
          FROM inserted i
          JOIN asignacion a WITH (UPDLOCK, HOLDLOCK)
            ON a.entidad_tipo = i.entidad_tipo
           AND a.entidad_id = i.entidad_id
           AND a.id <> i.id
           AND a.desde < ISNULL(i.hasta, '9999-12-31')
           AND i.desde < ISNULL(a.hasta, '9999-12-31')
        )
          THROW 50001, 'asignacion_sin_solape: el tramo se solapa con otro de la misma entidad', 1;
      END`);

    // ---------- evento (append-only) ----------
    await q.query(`
      CREATE TABLE evento (
        id            bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
        entidad_tipo  nvarchar(10)  NOT NULL,
        entidad_id    uniqueidentifier         NOT NULL,
        tipo          nvarchar(40)  NOT NULL,
        actor_id      uniqueidentifier REFERENCES usuario(id),
        actor_externo nvarchar(160),
        payload       nvarchar(max) NOT NULL DEFAULT '{}',
        ocurrido_en   datetimeoffset(3)  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT evento_entidad_tipo_check CHECK (entidad_tipo IN ('ticket','ot','cotizacion')),
        CONSTRAINT evento_payload_json_check CHECK (ISJSON(payload) = 1)
      )`);
    await q.query(`CREATE INDEX idx_evento_entidad ON evento (entidad_tipo, entidad_id, ocurrido_en DESC)`);
    // Desvío pactado: trigger en vez de REVOKE, así la inmutabilidad vale sea cual sea el rol.
    // (TRUNCATE no dispara triggers: los tests lo usan para limpiar.)
    await q.query(`
      CREATE TRIGGER trg_evento_inmutable ON evento
      AFTER UPDATE, DELETE
      AS
      BEGIN
        SET NOCOUNT ON;
        THROW 50002, 'evento es append-only: UPDATE y DELETE no permitidos', 1;
      END`);

    // ---------- mensaje_ticket ----------
    await q.query(`
      CREATE TABLE mensaje_ticket (
        id            uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWID(),
        ticket_id     uniqueidentifier NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
        tipo          nvarchar(20)  NOT NULL,
        autor_id      uniqueidentifier REFERENCES usuario(id),
        autor_externo nvarchar(160),
        cuerpo        nvarchar(max)         NOT NULL,
        cuerpo_html   nvarchar(max),
        message_id    nvarchar(255),
        in_reply_to   nvarchar(255),
        referencias   nvarchar(max),  -- arreglo JSON
        enviado_en    datetimeoffset(3),
        creado_en     datetimeoffset(3)  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT mensaje_ticket_tipo_check CHECK (tipo IN ('cliente','respuesta_cliente','nota_interna')),
        CONSTRAINT mensaje_ticket_autor_check CHECK (
          (tipo = 'cliente' AND autor_externo IS NOT NULL AND autor_id IS NULL)
          OR (tipo <> 'cliente' AND autor_id IS NOT NULL)
        ),
        CONSTRAINT mensaje_ticket_referencias_json_check CHECK (referencias IS NULL OR ISJSON(referencias) = 1)
      )`);
    // En PG el UNIQUE admitía N NULL; en SQL Server solo uno: unique filtered index.
    await q.query(`
      CREATE UNIQUE INDEX uq_mensaje_ticket_message_id ON mensaje_ticket (message_id)
      WHERE message_id IS NOT NULL`);
    await q.query(`CREATE INDEX idx_mensaje_ticket_ticket ON mensaje_ticket (ticket_id, creado_en)`);
    await q.query(`CREATE INDEX idx_mensaje_ticket_in_reply_to ON mensaje_ticket (in_reply_to)`);

    // ---------- cotizacion ----------
    await q.query(`
      CREATE TABLE cotizacion (
        id             uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWID(),
        numero         nvarchar(12) NOT NULL UNIQUE,
        ot_id          uniqueidentifier REFERENCES ot(id) ON DELETE SET NULL,
        cliente_id     uniqueidentifier REFERENCES cliente(id),
        monto_clp      bigint      NOT NULL,
        fecha          date        NOT NULL DEFAULT CONVERT(date, SYSDATETIMEOFFSET()),
        estado         nvarchar(12) NOT NULL DEFAULT 'borrador',
        version        smallint    NOT NULL DEFAULT 1,
        es_principal   bit     NOT NULL DEFAULT 0,
        aprobada_en    datetimeoffset(3),
        anulada_en     datetimeoffset(3),
        creado_en      datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        actualizado_en datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT cotizacion_monto_check  CHECK (monto_clp >= 0),
        CONSTRAINT cotizacion_estado_check CHECK (estado IN ('borrador','enviada','aprobada','rechazada'))
      )`);
    await q.query(`
      CREATE UNIQUE INDEX uq_cotizacion_principal_por_ot ON cotizacion (ot_id)
      WHERE es_principal = 1 AND ot_id IS NOT NULL`);
    await q.query(`CREATE INDEX idx_cotizacion_estado_fecha ON cotizacion (estado, fecha)`);

    // ---------- tablas de OT ----------
    await q.query(`
      CREATE TABLE ticket_ot (
        ticket_id        uniqueidentifier NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
        ot_id            uniqueidentifier NOT NULL REFERENCES ot(id) ON DELETE CASCADE,
        es_origen        bit     NOT NULL DEFAULT 0,
        vinculado_por_id uniqueidentifier NOT NULL REFERENCES usuario(id),
        creado_en        datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        PRIMARY KEY (ticket_id, ot_id)
      )`);
    await q.query(`CREATE UNIQUE INDEX uq_ticket_ot_origen ON ticket_ot (ot_id) WHERE es_origen = 1`);

    await q.query(`
      CREATE TABLE ot_colaborador (
        ot_id           uniqueidentifier NOT NULL REFERENCES ot(id) ON DELETE CASCADE,
        usuario_id      uniqueidentifier NOT NULL REFERENCES usuario(id),
        agregado_por_id uniqueidentifier NOT NULL REFERENCES usuario(id),
        creado_en       datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        PRIMARY KEY (ot_id, usuario_id)
      )`);

    await q.query(`
      CREATE TABLE comentario_ot (
        id              uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWID(),
        ot_id           uniqueidentifier NOT NULL REFERENCES ot(id) ON DELETE CASCADE,
        autor_id        uniqueidentifier NOT NULL REFERENCES usuario(id),
        cuerpo          nvarchar(max)    NOT NULL,
        visible_cliente bit NOT NULL DEFAULT 0,
        creado_en       datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        actualizado_en  datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET()
      )`);

    await q.query(`
      CREATE TABLE hora_trabajada (
        id             uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWID(),
        ot_id          uniqueidentifier NOT NULL REFERENCES ot(id) ON DELETE CASCADE,
        usuario_id     uniqueidentifier NOT NULL REFERENCES usuario(id),
        fecha          date         NOT NULL,
        horas          decimal(5,2) NOT NULL,
        detalle        nvarchar(max),
        creado_en      datetimeoffset(3)  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        actualizado_en datetimeoffset(3)  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT hora_trabajada_horas_check CHECK (horas > 0 AND horas <= 24)
      )`);

    await q.query(`
      CREATE TABLE etapa_ot (
        id             uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWID(),
        ot_id          uniqueidentifier NOT NULL REFERENCES ot(id) ON DELETE CASCADE,
        nombre         nvarchar(120) NOT NULL,
        fecha_inicio   date     NOT NULL,
        fecha_termino  date     NOT NULL,
        orden          smallint NOT NULL,
        creado_en      datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        actualizado_en datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT etapa_ot_fechas_check CHECK (fecha_termino >= fecha_inicio)
      )`);

    // ---------- adjunto / notificacion ----------
    await q.query(`
      CREATE TABLE adjunto (
        id            uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWID(),
        entidad_tipo  nvarchar(10)  NOT NULL,
        entidad_id    uniqueidentifier         NOT NULL,
        nombre        nvarchar(255) NOT NULL,
        mime          nvarchar(120) NOT NULL,
        tamano_bytes  int      NOT NULL,
        sha256        nchar(64)     NOT NULL,
        storage_key   nvarchar(255) NOT NULL,
        estado        nvarchar(12)  NOT NULL DEFAULT 'escaneando',
        subido_por_id uniqueidentifier REFERENCES usuario(id),
        creado_en     datetimeoffset(3)  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT adjunto_entidad_tipo_check CHECK (entidad_tipo IN ('ticket','ot','mensaje')),
        CONSTRAINT adjunto_tamano_check CHECK (tamano_bytes > 0 AND tamano_bytes <= 26214400),
        CONSTRAINT adjunto_estado_check CHECK (estado IN ('escaneando','limpio','infectado'))
      )`);

    await q.query(`
      CREATE TABLE notificacion (
        id           uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWID(),
        usuario_id   uniqueidentifier NOT NULL REFERENCES usuario(id),
        tipo         nvarchar(40)  NOT NULL,
        entidad_tipo nvarchar(20)  NOT NULL,
        entidad_id   uniqueidentifier         NOT NULL,
        titulo       nvarchar(200) NOT NULL,
        cuerpo       nvarchar(max)         NOT NULL,
        leida_en     datetimeoffset(3),
        creado_en    datetimeoffset(3)  NOT NULL DEFAULT SYSDATETIMEOFFSET()
      )`);
    await q.query(`
      CREATE INDEX idx_notificacion_no_leidas ON notificacion (usuario_id, creado_en DESC)
      WHERE leida_en IS NULL`);

    // ---------- SLA ----------
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

    await q.query(`
      CREATE TABLE calendario_laboral (
        id          int IDENTITY(1,1) NOT NULL PRIMARY KEY,
        dia_semana  smallint NOT NULL,
        hora_inicio time(0)  NOT NULL,
        hora_fin    time(0)  NOT NULL,
        CONSTRAINT calendario_laboral_dia_check  CHECK (dia_semana BETWEEN 1 AND 7),
        CONSTRAINT calendario_laboral_hora_check CHECK (hora_fin > hora_inicio)
      )`);
    await q.query(`
      INSERT INTO calendario_laboral (dia_semana, hora_inicio, hora_fin) VALUES
        (1, '09:00', '18:30'), (2, '09:00', '18:30'), (3, '09:00', '18:30'),
        (4, '09:00', '18:30'), (5, '09:00', '18:30')`);

    await q.query(`
      CREATE TABLE feriado (
        fecha         date PRIMARY KEY,
        nombre        nvarchar(120) NOT NULL,
        irrenunciable bit      NOT NULL DEFAULT 0
      )`);

    await q.query(`
      CREATE TABLE sla_pausa (
        id           uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWID(),
        entidad_tipo nvarchar(10) NOT NULL,
        entidad_id   uniqueidentifier        NOT NULL,
        desde        datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        hasta        datetimeoffset(3),
        motivo       nvarchar(200),
        CONSTRAINT sla_pausa_entidad_tipo_check CHECK (entidad_tipo IN ('ticket','ot'))
      )`);
    await q.query(`
      CREATE UNIQUE INDEX uq_sla_pausa_abierta ON sla_pausa (entidad_tipo, entidad_id)
      WHERE hasta IS NULL`);

    // ---------- correo ----------
    await q.query(`
      CREATE TABLE correo_ingerido (
        id          uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWID(),
        message_id  nvarchar(255) NOT NULL UNIQUE,
        origen      nvarchar(60)  NOT NULL,
        recibido_en datetimeoffset(3)  NOT NULL,
        estado      nvarchar(12)  NOT NULL DEFAULT 'pendiente',
        ticket_id   uniqueidentifier REFERENCES ticket(id) ON DELETE SET NULL,
        error       nvarchar(max),
        raw_ref     nvarchar(255),
        CONSTRAINT correo_ingerido_estado_check CHECK (estado IN ('pendiente','procesado','ignorado','error'))
      )`);

    await q.query(`
      CREATE TABLE correo_saliente (
        id                 uniqueidentifier NOT NULL PRIMARY KEY DEFAULT NEWID(),
        plantilla          nvarchar(60)  NOT NULL,
        para               nvarchar(320) NOT NULL,
        asunto             nvarchar(300) NOT NULL,
        cuerpo_html        nvarchar(max)         NOT NULL,
        headers            nvarchar(max) NOT NULL DEFAULT '{}',
        mensaje_ticket_id  uniqueidentifier REFERENCES mensaje_ticket(id) ON DELETE SET NULL,
        estado             nvarchar(12)  NOT NULL DEFAULT 'pendiente',
        intentos           smallint     NOT NULL DEFAULT 0,
        proximo_intento_en datetimeoffset(3)  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        error              nvarchar(max),
        creado_en          datetimeoffset(3)  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        actualizado_en     datetimeoffset(3)  NOT NULL DEFAULT SYSDATETIMEOFFSET(),
        CONSTRAINT correo_saliente_estado_check CHECK (estado IN ('pendiente','enviando','enviado','fallido')),
        CONSTRAINT correo_saliente_headers_json_check CHECK (ISJSON(headers) = 1)
      )`);
    await q.query(`
      CREATE INDEX idx_correo_saliente_pendiente ON correo_saliente (proximo_intento_en)
      WHERE estado = 'pendiente'`);
  }

  public async down(q: QueryRunner): Promise<void> {
    // Orden inverso de dependencias. Los índices y los triggers caen junto con su tabla.
    for (const tabla of [
      "correo_saliente",
      "correo_ingerido",
      "sla_pausa",
      "feriado",
      "calendario_laboral",
      "sla_config",
      "notificacion",
      "adjunto",
      "etapa_ot",
      "hora_trabajada",
      "comentario_ot",
      "ot_colaborador",
      "ticket_ot",
      "cotizacion",
      "mensaje_ticket",
      "evento",
      "asignacion",
      "ot",
      "ticket",
      "cliente",
      "usuario",
      "folio_counter",
    ]) {
      await q.query(`DROP TABLE ${tabla}`);
    }
  }
}
