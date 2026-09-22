# siga-ot — Diseño del backend

Mesa de ayuda propia + gestión de OT y cotizaciones para SIGA Ltda (~8 usuarios). Diseño elaborado el 2026-09-20/21 a partir del prototipo Lovable (https://pixel-perfect-canvas-6040.lovable.app), que sirve de plantilla para el frontend real. Este documento es la fuente de verdad del backend.

## 0. Decisiones de Felipe (2026-09-21)

| # | Tema | Decisión |
|---|---|---|
| 1 | Buzón soporte@sigaltda.cl / Microsoft 365 | Lo administra alguien de IT; se consulta cuando haga falta o al pasar a producción. Mientras tanto, ingesta por IMAP genérico detrás de `MailboxSource`. |
| 2 | Horario laboral SLA | Lunes a viernes 09:00–18:30 (asumido continuo, sin colación; sábado y domingo no laborables). Feriados nacionales de Chile. Zona `America/Santiago`. |
| 3 | SLA en "Esperando cliente" | **Se pausa.** |
| 4 | Responsable de ticket entrante (portal/correo) | Nace **sin responsable**. Los colegas ven la bandeja y **toman** el ticket (`POST /tickets/:id/tomar`); quien lo toma es el responsable. Si dos lo toman a la vez, gana el primero (índice único del tramo abierto) y el otro recibe 409. |
| — | BD | **SQL Server 2025** (Developer, `localhost:1433`, BD `siga-tickets`; colación `Modern_Spanish_CI_AS`; sin Full-Text). Antes era PostgreSQL (portado en septiembre 2026; el esquema de 2.3 sigue siendo el modelo lógico, el cuadro de 2.5 recoge las equivalencias). El legacy (siga-express-erp: MySQL/MSSQL) queda detrás de `LegacyGateway`, vacío por ahora. |
| — | Auth | La diseña Felipe. Fase 0 parte del patrón ya existente en `siga-log-monitor` (JWT + bcrypt + `authorize`). |
| — | Cliente | Tabla catálogo simple (`cliente`), sin contactos. El solicitante es texto en el ticket. |

Pendientes no bloqueantes: roles concretos por persona, años de retención, fracciones de hora (0,25), storage local vs S3, revisión de la Ley 21.719 (vigente dic-2026) antes de abrir el portal.

## 1. Arquitectura

Monolito modular Express + TypeORM + SQL Server. Un proceso API y un proceso `worker` (PM2). Sin Redis ni broker.

- Capas: `routes → controllers (Zod, HTTP) → services (reglas, transacciones) → TypeORM`. `policies/` para permisos por fila. Sin lógica en controllers, sin HTTP en services.
- Errores: los servicios lanzan `AppError(status, code, message)`; `errorHandler` central. Formato: `{status:'error', code, message, details?}`. Éxito: `{status:'ok', data, meta?}`.
- Validación: Zod vía middleware `validate({body,params,query})` que deja el resultado en `req.validated`.
- Logging: `pino` con `requestId`. Nunca loguear cuerpos de correo, tokens ni datos del solicitante.
- Config: `config/env.ts` valida el entorno con Zod al arrancar y falla rápido.
- Todo lo externo detrás de interfaces: `MailboxSource` (Graph/Gmail/IMAP), `Mailer`, `FileStorage` (disco/S3), `LegacyGateway`.

```
backend/src/
  api/            app.ts  server.ts  worker.ts
  config/         env.ts  dataSource.ts  logger.ts
  auth/           jwt.ts  password.ts  portalToken.ts
  middlewares/    authenticate.ts  authorize.ts  validate.ts  errorHandler.ts  rateLimit.ts  upload.ts
  policies/       ot.policy.ts  ticket.policy.ts
  entities/  routes/{interna,publico}/  controllers/  services/  validations/
  mail/{ingest,outbound}/   storage/   legacy/   jobs/   errors/
  migrations/   scripts/    types/
```

Convenciones (alineadas con `siga-log-monitor`, salvo donde se indica):
- **ESModules siempre** (NodeNext). `emitDecoratorMetadata: false` → todo `@Column` lleva `type` explícito.
- Me aparto del hermano en: `synchronize: false` **siempre** (los CHECK, índices filtrados, la columna calculada y los triggers no los modela TypeORM y `synchronize` los borraría); snake_case en BD (`SnakeNamingStrategy`); `pino` en vez de `console.error`; servicios que lanzan `AppError`.

## 2. Modelo de datos

### 2.1 Convenciones
- Todo `datetimeoffset(3)` (proceso con `TZ=UTC`; en el diseño lógico, `timestamptz`); `date` solo para fechas de negocio (`hora_trabajada.fecha`, `etapa_ot.fecha_*`, `feriado.fecha`, `cotizacion.fecha`, `ot.fecha_estimada_termino`).
- PK `uniqueidentifier` (`DEFAULT NEWID()`). `numero` (TK-0001) es clave de negocio UNIQUE. **SQL Server devuelve los uuid en MAYÚSCULAS**: un transformer de TypeORM (`uuidTransformer`) los normaliza a minúsculas en toda entidad, y esa es la forma canónica en JWT, JSON y URLs.
- `creado_en` / `actualizado_en` `datetimeoffset(3) NOT NULL DEFAULT SYSDATETIMEOFFSET()` en tablas mutables. `actualizado_en` lo fija un subscriber de TypeORM en cada `save()` (el `@UpdateDateColumn` escribiría hora local del servidor con offset +00:00); en un `UPDATE` por query builder hay que pasarlo explícito.
- Catálogos como `nvarchar + CHECK` (no hay enums nativos) con enum TS espejo. `cliente`, `sla_config`, `feriado`, `calendario_laboral` son tablas.
- Sin extensiones. La base usa la colación `Modern_Spanish_CI_AS` (insensible a mayúsculas, sensible a acentos): de ella depende que `ticket.solicitante_email`, `usuario.email` y `cliente.nombre` comparen sin distinguir mayúsculas (un test falla si la colación cambia). Texto: `nvarchar`, nunca `text`.
- Soft delete: `usuario`, `cliente`, `cotizacion` (anular). Append-only: `evento`, `asignacion`, `correo_ingerido`, `mensaje_ticket`. Hard delete: `ot_colaborador`, `etapa_ot`, `notificacion`, `adjunto` infectado.

### 2.2 Folios sin huecos
Una SEQUENCE deja huecos en cada rollback. Se usa `folio_counter(serie PK, ultimo bigint, ancho smallint)` con semilla `('TK',0,4)`, `('OT',1040,4)`, `('COT',2040,4)`, incrementado dentro de la misma transacción del insert:

```sql
UPDATE folio_counter SET ultimo = ultimo + 1
OUTPUT inserted.serie + '-' + RIGHT(REPLICATE('0', inserted.ancho) + CAST(inserted.ultimo AS nvarchar(20)), inserted.ancho)
WHERE serie = @0;
```
Helper `siguienteFolio(manager, serie)` que exige un `EntityManager` transaccional.

### 2.3 Tablas

**usuario**: id, username UNIQUE varchar(50), nombre varchar(120), cargo varchar(80) null, email UNIQUE varchar(160), password_hash varchar(120) (`select:false`), rol CHECK IN ('admin','gestion','tecnico','lectura'), activo bool default true, must_change_password bool default false. Incluir un usuario de sistema `sistema` (inactivo) para `recepcionado_por` de tickets de portal/correo.

**cliente**: id, nombre UNIQUE, activo.

**ticket**: id, numero UNIQUE varchar(12), asunto varchar(200), descripcion text, solicitante_nombre varchar(120), solicitante_email nvarchar(320) (CI por colación), solicitante_telefono null, solicitante_empresa null, cliente_id null FK (SET NULL), canal CHECK IN ('portal','correo','telefono','presencial','interno'), prioridad CHECK IN ('alta','media','baja'), estado CHECK IN ('nuevo','abierto','esperando_cliente','resuelto','cerrado') default 'nuevo', fecha_ingreso timestamptz default now(), recepcionado_por_id FK usuario NOT NULL (**inmutable**), responsable_actual_id null FK (denormalizado de `asignacion`; NULL = sin tomar), primera_respuesta_en null (se escribe una sola vez), resuelto_en, cerrado_en, sla_resolucion_vence_en, sla_respuesta_vence_en, sla_estado CHECK IN ('en_plazo','por_vencer','vencida') default 'en_plazo', sla_pausado_desde null, token_publico uniqueidentifier UNIQUE default NEWID().
Índices: UNIQUE(numero); (estado, prioridad); filtrado (responsable_actual_id) WHERE estado <> 'resuelto' AND estado <> 'cerrado'; filtrado (sla_estado, sla_resolucion_vence_en) con el mismo predicado; (solicitante_email). Sin índices trigram: la búsqueda global usa `LIKE`.

**ot**: id, numero UNIQUE (OT-1041…), titulo, descripcion, cliente_id null FK, area_interna null, es_interna bool default false con `CHECK ((es_interna = 1 AND area_interna IS NOT NULL AND cliente_id IS NULL) OR (es_interna = 0 AND cliente_id IS NOT NULL))`, categoria CHECK IN ('mantencion','instalacion','reparacion','cotizacion','soporte','otro'), prioridad, origen CHECK IN ('mesa_ayuda','correo','telefono','presencial','interna'), ubicacion null, solicitante_nombre/solicitante_contacto null, fecha_ingreso timestamptz, fecha_estimada_termino date null, estado CHECK IN ('ingresado','en_cotizacion','aprobado','en_ejecucion','terminado','facturado') default 'ingresado', recepcionado_por_id, responsable_actual_id, terminado_en null, sla_* igual que ticket (resolución).
Índices: (estado); (estado, prioridad, fecha_ingreso DESC); filtrado (responsable_actual_id) WHERE estado <> 'terminado' AND estado <> 'facturado'; (cliente_id). Sin trigram (`LIKE`).

**asignacion** (cadena de responsables, tickets y OT): id, entidad_tipo CHECK IN ('ticket','ot'), entidad_id uniqueidentifier, usuario_id FK, desde datetimeoffset(3) default SYSDATETIMEOFFSET(), hasta null CHECK (hasta IS NULL OR hasta > desde), motivo_entrada nvarchar(max) null (motivo de la derivación que lo entregó), derivado_por_id null FK, duracion_seg columna calculada `AS (DATEDIFF(SECOND, desde, hasta)) PERSISTED` (NULL con el tramo abierto).
- Unique filtered index `(entidad_tipo, entidad_id) WHERE hasta IS NULL` → un solo responsable abierto.
- Trigger `trg_asignacion_sin_solape` (`AFTER INSERT, UPDATE`) → sin tramos solapados: hace `THROW 50001` si `[desde, ISNULL(hasta,'9999-12-31'))` se cruza con otro tramo de la misma entidad. La consulta del trigger usa `WITH (UPDLOCK, HOLDLOCK)` (bloqueos de rango sobre el índice `(entidad_tipo, entidad_id, desde)`) para que sea correcto bajo concurrencia, también con RCSI. Un `THROW` dentro de un trigger deshace **toda** la transacción en curso; el perdedor de una carrera recibe 50001 o, si ambos bloquearon a la vez, 1205 (deadlock): el servicio debe tratar ambos como 409/reintento.
- Índice (entidad_tipo, entidad_id, desde).
- Derivar/tomar = una transacción: cerrar tramo abierto, abrir el nuevo, actualizar `responsable_actual_id`, insertar `evento`, insertar `notificacion`. El SLA no se toca.

**evento** (auditoría append-only, tickets/OT/cotizaciones): id bigint identity PK, entidad_tipo CHECK IN ('ticket','ot','cotizacion'), entidad_id, tipo varchar(40) ('creado','estado_cambiado','prioridad_cambiada','derivado','tomado','respuesta_cliente','nota_interna','comentario','vinculado_ot','horas_registradas','sla_cambiado','cotizacion_creada'…), actor_id null FK, actor_externo varchar(160) null, payload nvarchar(max) default '{}' con `CHECK (ISJSON(payload) = 1)`, ocurrido_en datetimeoffset(3) default SYSDATETIMEOFFSET(). Índice (entidad_tipo, entidad_id, ocurrido_en DESC). Sin `actualizado_en`. Inmutabilidad con trigger `trg_evento_inmutable` (`AFTER UPDATE, DELETE` con `THROW 50002`; funciona con cualquier rol, aunque `TRUNCATE` no lo dispara). El payload se valida con `z.discriminatedUnion('tipo', …)` antes de insertar.

**mensaje_ticket**: id, ticket_id FK CASCADE, tipo CHECK IN ('cliente','respuesta_cliente','nota_interna'), autor_id null FK, autor_externo null, `CHECK ((tipo='cliente' AND autor_externo IS NOT NULL AND autor_id IS NULL) OR (tipo<>'cliente' AND autor_id IS NOT NULL))`, cuerpo nvarchar(max), cuerpo_html null (sanitizado), message_id nvarchar(255) null con **unique filtered index** `WHERE message_id IS NOT NULL` (un UNIQUE de SQL Server admitiría un solo NULL), in_reply_to null, referencias null (arreglo JSON en `nvarchar(max)` con `CHECK (referencias IS NULL OR ISJSON(referencias) = 1)`), enviado_en null, creado_en. Índices (ticket_id, creado_en), (in_reply_to). **Regla**: el portal usa un método de repositorio distinto con `tipo <> 'nota_interna'` en el WHERE, nunca un filtro en memoria.

**cotizacion**: id, numero UNIQUE (COT-2041…), ot_id null FK (SET NULL), cliente_id null FK (NO ACTION), monto_clp bigint CHECK (>= 0), fecha date default fecha local del servidor, estado CHECK IN ('borrador','enviada','aprobada','rechazada'), version smallint default 1, es_principal bool default false, aprobada_en null, anulada_en null. Unique filtered index `(ot_id) WHERE es_principal = 1 AND ot_id IS NOT NULL`. N cotizaciones por OT (historial de rechazos/reajustes), una principal. Índice (estado, fecha).

**ticket_ot**: ticket_id FK, ot_id FK, es_origen bool default false, vinculado_por_id, creado_en. PK (ticket_id, ot_id). Unique filtered index `(ot_id) WHERE es_origen = 1`.
**ot_colaborador**: ot_id, usuario_id, agregado_por_id, creado_en. PK (ot_id, usuario_id). Colaborar ≠ derivar (no traspasa responsabilidad; colaborador ≠ responsable actual, validado en servicio).
**comentario_ot**: id, ot_id, autor_id, cuerpo, visible_cliente bool default false (interno por defecto).
**hora_trabajada**: id, ot_id, usuario_id, fecha date, horas decimal(5,2) CHECK (>0 AND <=24), detalle. Total = SUM on-demand.
**etapa_ot**: id, ot_id, nombre, fecha_inicio date, fecha_termino date CHECK (>= inicio), orden smallint. Editable tras crear la OT.
**adjunto**: id, entidad_tipo CHECK IN ('ticket','ot','mensaje'), entidad_id, nombre varchar(255), mime, tamano_bytes CHECK (>0 AND <=26214400), sha256 nchar(64), storage_key, estado CHECK IN ('escaneando','limpio','infectado'), subido_por_id null.
**notificacion**: id, usuario_id, tipo, entidad_tipo, entidad_id, titulo, cuerpo, leida_en null. Índice filtrado (usuario_id, creado_en DESC) WHERE leida_en IS NULL.
**sla_config**: prioridad PK, horas_resolucion int, horas_primera_respuesta int, usar_horas_habiles bool default true, pausar_en_espera_cliente bool default true, umbral_por_vencer decimal(3,2) default 0.20. Semilla: Alta 24/2, Media 72/8, Baja 120/24.
**calendario_laboral**: id, dia_semana smallint 1..7, hora_inicio time(0), hora_fin time(0) CHECK (fin > inicio). Semilla: lun–vie 09:00–18:30.
**feriado**: fecha date PK, nombre, irrenunciable bool. Carga por script/endpoint admin; no depender de API externa.
**sla_pausa**: id, entidad_tipo, entidad_id, desde, hasta null, motivo. Unique filtered index `(entidad_tipo, entidad_id) WHERE hasta IS NULL`.
**correo_ingerido**: id, message_id UNIQUE, origen, recibido_en, estado CHECK IN ('pendiente','procesado','ignorado','error'), ticket_id null, error, raw_ref.
**correo_saliente**: id, plantilla, para, asunto, cuerpo_html, headers nvarchar(max) default '{}' con `CHECK (ISJSON(headers) = 1)`, mensaje_ticket_id null, estado CHECK IN ('pendiente','enviando','enviado','fallido'), intentos smallint default 0, proximo_intento_en default now(), error. Índice filtrado (proximo_intento_en) WHERE estado = 'pendiente'.

### 2.4 TypeORM
`type` explícito en cada `@Column`; `@JoinColumn({name})` explícito; `synchronize:false` siempre; migraciones versionadas en `src/migrations/` con las piezas que TypeORM no modela (índices filtrados, CHECK, columna calculada, triggers) escritas a mano con `queryRunner.query()` (una sentencia por llamada: `CREATE TRIGGER` exige su propio batch y no hay `GO`); sin `cascade` salvo `ticket→mensaje_ticket` y `ot→etapa_ot`; `NO ACTION` (equivalente al RESTRICT de PG) por defecto hacia `usuario` y hacia `cliente` (SQL Server rechaza rutas de cascada múltiples; los clientes se desactivan con `activo`, no se borran); relaciones polimórficas (`evento`, `adjunto`, `asignacion`) como columnas planas sin `@ManyToOne`; `decimal` y `bigint` llegan como string → transformer donde el diseño los usa como número; `jsonb`/`text[]` son `nvarchar(max)` con transformer JSON (no se usa el tipo `json` nativo: tedious no lo soporta bien).

### 2.5 Equivalencias PostgreSQL → SQL Server (port de septiembre 2026)
| PostgreSQL (fase 0 original) | SQL Server (hoy) |
|---|---|
| `uuid` + `gen_random_uuid()` | `uniqueidentifier` + `NEWID()`; salen en MAYÚSCULAS del driver → transformer a minúsculas |
| `timestamptz` + `now()` | `datetimeoffset(3)` + `SYSDATETIMEOFFSET()` |
| `varchar(n)` / `text` / `char(n)` | `nvarchar(n)` / `nvarchar(max)` / `nchar(n)` |
| `boolean`, `numeric` | `bit`, `decimal` |
| `jsonb`, `text[]` | `nvarchar(max)` + `CHECK (ISJSON(col) = 1)` (arreglo JSON para `referencias`) |
| `citext` | `nvarchar` + colación `Modern_Spanish_CI_AS` de la BD |
| extensiones `pgcrypto`, `citext`, `pg_trgm`, `btree_gist` | ninguna; sin Full-Text |
| índice parcial `WHERE ...` | filtered index (solo comparaciones con AND: `NOT IN (a,b)` → `<> a AND <> b`) |
| `UNIQUE` sobre columna nullable (N NULL) | unique filtered index `WHERE col IS NOT NULL` (`mensaje_ticket.message_id`) |
| `GENERATED ... STORED` | columna calculada `PERSISTED` |
| `EXCLUDE USING gist` | trigger `AFTER INSERT, UPDATE` + `THROW 50001`, con `UPDLOCK, HOLDLOCK` |
| trigger plpgsql `BEFORE UPDATE OR DELETE` | trigger T-SQL `AFTER UPDATE, DELETE` + `THROW 50002` |
| GIN trigram | nada; `LIKE` |
| `UPDATE ... RETURNING` | `UPDATE ... OUTPUT inserted.*` |
| `FOR UPDATE SKIP LOCKED` | `WITH (UPDLOCK, READPAST, ROWLOCK)` |
| `ON CONFLICT DO NOTHING` | buscar-luego-insertar / `MERGE` |
| `ON DELETE SET NULL/RESTRICT` hacia `cliente`/`usuario` | `NO ACTION` (rutas de cascada múltiples); `SET NULL` se conserva en `cotizacion.ot_id`, `correo_ingerido.ticket_id`, `correo_saliente.mensaje_ticket_id` |
| errores `23505`, `23514`/`23503`, `23P01`, excepción del trigger | `number` 2627/2601 (único), 547 (FK/CHECK), 50001 (solape de asignación), 50002 (evento inmutable); 1205 = deadlock |

## 3. SLA
- Vencimiento = ingreso + plazo según prioridad actual, en **horas hábiles** (lun–vie 09:00–18:30, sin feriados chilenos, `America/Santiago`). Se recalcula al cambiar la prioridad, al cerrar una pausa y al editar `sla_config`. **No se reinicia al derivar ni al tomar.**
- Pausa mientras el ticket está en `esperando_cliente` (`sla_pausa`); al reanudar, el vencimiento se corre los minutos hábiles pausados.
- Estados: `en_plazo` → `por_vencer` (queda < 20 % del plazo en minutos hábiles) → `vencida`. Un job cada 5 min actualiza `sla_estado` y notifica solo en la transición.
- `sumarHorasHabiles(inicio, horas, calendario, feriados, zona)`: función pura con **Luxon** (Santiago tiene horario de verano). Es el corazón del sistema y lleva la mayor cobertura de tests.
- Feriados nacionales Chile 2026 (verificar contra calendario oficial antes de producción): 1-ene, 3-abr (Viernes Santo), 4-abr (Sábado Santo), 1-may, 21-may, 21-jun, 29-jun, 16-jul, 15-ago, 18-sep, 19-sep, 12-oct, 31-oct, 1-nov, 8-dic, 25-dic.

## 4. API REST
Interna `/api/v1` (JWT). Pública `/publico` (sin JWT). `/webhooks`. Envelope `{status:'ok', data, meta:{page,perPage,total}}`; orden con whitelist de columnas; fechas ISO 8601.

| Método | Ruta | Rol mínimo | Descripción |
|---|---|---|---|
| POST | /auth/login | — | Login, devuelve JWT |
| GET | /auth/me | cualquiera | Perfil |
| POST | /auth/password | cualquiera | Cambiar contraseña propia |
| GET/POST/PATCH | /usuarios[/:id] | admin | ABM |
| GET | /clientes | lectura | Catálogo |
| POST/PATCH | /clientes[/:id] | admin | |
| GET | /tickets | lectura | Filtros estado, prioridad, canal, responsable, mios, sinAsignar, q, desde, hasta |
| POST | /tickets | tecnico | Alta interna (teléfono/presencial/interno); recepcionado_por = usuario logueado |
| GET | /tickets/:id | lectura | Detalle + hilo completo |
| PATCH | /tickets/:id | tecnico* | Asunto, prioridad (recalcula SLA) |
| POST | /tickets/:id/estado | tecnico* | Estado del ticket |
| POST | /tickets/:id/tomar | tecnico | Toma un ticket sin responsable; 409 si ya tiene |
| POST | /tickets/:id/mensajes | tecnico* | `{tipo:'respuesta_cliente'\|'nota_interna', cuerpo, adjuntoIds}` |
| POST | /tickets/:id/derivar | responsable, gestion, admin | `{destinoId, motivo, mantenerComoColaborador}` |
| POST | /tickets/:id/convertir-a-ot | gestion | Crea OT con herencia completa |
| POST/DELETE | /tickets/:id/ots[/:otId] | gestion | Vincular/desvincular |
| GET | /tickets/:id/eventos | lectura | Timeline |
| GET | /ots, /ots/kanban | lectura | Lista + filtros; kanban agrupado por estado |
| POST | /ots | tecnico | Alta |
| GET | /ots/:id | lectura | Detalle (cadena, colaboradores, horas, etapas, cotizaciones) |
| PATCH | /ots/:id | tecnico* | Campos editables |
| POST | /ots/:id/estado | tecnico* | **Único** camino de cambio de estado (kanban sin drag & drop) |
| POST | /ots/:id/derivar | responsable, gestion, admin | |
| POST/DELETE | /ots/:id/colaboradores[/:usuarioId] | responsable, gestion | Además, cualquier tecnico puede añadirse a sí mismo (POST) |
| POST | /ots/:id/comentarios | tecnico | `{cuerpo, visibleCliente}` |
| GET/POST/DELETE | /ots/:id/horas[/:id] | tecnico | Propias, y registrar solo si es responsable o colaborador; gestion/admin cualquiera |
| GET/POST/PATCH/DELETE | /ots/:id/etapas[/:id] | tecnico* | Gantt |
| GET/POST | /cotizaciones | gestion | |
| PATCH | /cotizaciones/:id | gestion | Solo en borrador |
| POST | /cotizaciones/:id/estado | gestion | Enviar/aprobar/rechazar |
| POST | /ots/:id/cotizaciones/vincular | gestion | |
| POST | /adjuntos; GET /adjuntos/:id/descargar | tecnico / lectura | multipart; stream autenticado |
| GET/PUT | /sla/config | lectura / admin | |
| GET/POST/DELETE | /sla/feriados[/:fecha] | admin | |
| GET | /notificaciones, /notificaciones/resumen | cualquiera | |
| POST | /notificaciones/:id/leer, /leer-todas | cualquiera | |
| GET | /dashboard | lectura | Todos los agregados; `?desde&hasta` |
| GET | /buscar | lectura | `?q=` global (`LIKE`, ~miles de filas; sin Full-Text) |

\* `tecnico` solo si es responsable o colaborador; `admin`/`gestion` sin restricción.

Pública: `POST /publico/tickets` (captcha + rate limit 5/h/IP), `POST /publico/tickets/seguimiento` (`{numero,email}` → token de portal 15 min, scope `portal`), `GET /publico/ticket`, `POST /publico/ticket/mensajes`, `POST /publico/adjuntos`, `GET /publico/adjuntos/:id/descargar`. Webhook: `POST /webhooks/graph`.

## 5. Pipelines asíncronos
- **Ingesta de correo**: `MailboxSource {nombre, fetchNuevos(cursor), marcarLeido}`. Por mensaje: (1) `INSERT correo_ingerido` capturando el error 2627/2601 de `message_id` UNIQUE (o `MERGE`) (idempotencia antes de cualquier efecto); (2) descartar bucles: `Auto-Submitted`, `Precedence: bulk/auto_reply`, remitente = soporte@, header `X-SIGA-Ticket`, rebotes DSN; (3) threading por `In-Reply-To`/`References` contra `mensaje_ticket.message_id`, luego regex `TK-\d{4}` en asunto validando remitente, si no ticket nuevo `canal='correo'`; (4) adjuntos a `FileStorage` + antivirus, HTML sanitizado; (5) respuesta del cliente reabre `esperando_cliente|resuelto → abierto` y cierra la pausa de SLA. Errores quedan en `estado='error'`, reintento manual por admin.
- **Correo saliente**: outbox transaccional (`correo_saliente` se inserta en la misma transacción del hecho). Worker cada 30 s tomando filas con `WITH (UPDLOCK, READPAST, ROWLOCK)` (equivalente de `FOR UPDATE SKIP LOCKED`; aún no implementado), backoff 2^intentos minutos, 5 intentos y luego `fallido` + notificación a admin. Todo saliente lleva `Message-ID` propio, `References` y `X-SIGA-Ticket`. El ticket del portal se persiste directo; a soporte@ solo se avisa con `Auto-Submitted: auto-generated`.
- **Cola**: sin BullMQ ni pg-boss; tablas-cola + `node-cron` en `worker.ts` (PM2, `instances: 1`). Migrar a `pg-boss` solo si crece el volumen.

## 6. Seguridad
RBAC:

| Acción | admin | gestion | tecnico | lectura |
|---|:--:|:--:|:--:|:--:|
| Ver OT/tickets/dashboard | ✓ | ✓ | ✓ | ✓ |
| Crear ticket / OT | ✓ | ✓ | ✓ | — |
| Tomar ticket sin responsable | ✓ | ✓ | ✓ | — |
| Editar, cambiar estado/prioridad | ✓ | ✓ | si responsable o colaborador | — |
| **Derivar** | ✓ | ✓ | solo si es el responsable actual | — |
| Colaboradores | ✓ | ✓ | si responsable; cualquier tecnico puede añadirse a sí mismo | — |
| Responder al cliente / nota interna | ✓ | ✓ | si responsable o colaborador | — |
| Registrar horas | ✓ | ✓ | solo propias y solo si es responsable o colaborador | — |
| Etapas (Gantt) | ✓ | ✓ | si responsable | — |
| Cotizaciones (crear/editar/enviar/aprobar) | ✓ | ✓ | — | — |
| Vincular ticket↔OT, convertir a OT | ✓ | ✓ | — | — |
| SLA/feriados, usuarios, anular cotización, reprocesar correo | ✓ | — | — | — |

Permisos en dos niveles: `authorize(rol)` (grueso) + `policies/*.policy.ts` (por fila), invocado desde el **servicio** (también se llama desde jobs).

**Desvío de la Fase 3**: la matriz de arriba describe OT. Para **ticket** no existe columna de colaborador: el esquema no tiene `ticket_colaborador` (a diferencia de `ot_colaborador`). Dondequiera que esta tabla o la sección 4 digan "responsable o colaborador" para una fila de ticket, en la implementación es solo "responsable actual" — ver `policies/ticket.policy.ts` y la sección 12.

Portal: error idéntico en todos los casos de seguimiento ("No pudimos validar esos datos") y retardo constante; rate limit por IP y por correo; captcha (Turnstile/hCaptcha); DTOs que construyen el objeto campo a campo (`toPortalTicket`, `toPortalOt`) — nunca salen notas internas, horas, montos ni usuarios distintos al responsable; token `scope:'portal'` 15 min y `authenticate` interno lo rechaza. Adjuntos: whitelist MIME+extensión, 10 MB/archivo y 25 MB/ticket, almacenados fuera del webroot con nombre = sha256, ClamAV, descarga con `Content-Disposition: attachment` y `nosniff`. Datos personales: aviso de finalidad en el portal, anonimización de `solicitante_*` de tickets cerrados tras el plazo de retención, `evento.payload` guarda ids no copias. Secretos solo por variables de entorno.

## 7. Correcciones respecto del prototipo Lovable
- Derivar restringido (hoy cualquiera puede).
- "Recepcionado por" sale del usuario logueado en servidor; nunca del body.
- Fechas con hora (`datetimeoffset`), no solo día.
- OT interna: el CHECK impide el estado inconsistente cliente/área.
- Cotizaciones N por OT con una principal (el prototipo asumía 1:1).
- SLA en horas hábiles (el prototipo cuenta horas corridas).
- Cliente como catálogo, no texto libre.
- Nuevo: tickets entrantes sin responsable + acción "Tomar" (el frontend necesita botón y filtro "Sin asignar").

## 8. Testing y despliegue
Vitest + Supertest contra la BD `siga-tickets-test` de SQL Server (la suite la crea si no existe y se niega a correr contra un nombre que no termine en `-test`). Prioridad: (1) `sumarHorasHabiles` (fin de semana, feriado, inicio fuera de horario, cruce de horario de verano, plazo 0, pausa); (2) derivación y toma (un solo tramo abierto, destino ≠ actual, motivo obligatorio, permisos, N derivaciones, SLA intacto, 409 en toma concurrente); (3) herencia ticket→OT; (4) threading, idempotencia y bucles de correo; (5) visibilidad del portal (test de forma del JSON completo, sin notas internas/montos/horas); (6) folios concurrentes sin huecos; (7) transiciones inválidas → 409; (8) matriz RBAC parametrizada.
Docker Compose: `api`, `worker` (misma imagen), volumen de adjuntos, `clamav` (SQL Server corre en el host, no en Docker). PM2 con `ecosystem.config.cjs` (api cluster, worker fork 1). Backups `BACKUP DATABASE ... WITH COMPRESSION` diario + copia externa semanal. Migraciones en el entrypoint del servicio `api`.

## 9. Plan por fases
| Fase | Entrega | Duración |
|---|---|---|
| **0** | **HECHA.** Esqueleto, Docker, **migración inicial con todo el esquema**, auth + RBAC + usuarios, `/health`, tests | 3–4 días |
| **1** | **HECHA (2026-09-21).** OT núcleo: CRUD, kanban, estado, derivación + cadena, colaboradores, auditoría, horas, etapas, comentarios, adjuntos locales. Ver sección 10 | 1,5 sem |
| **2** | **HECHA (2026-09-22).** Cotizaciones: CRUD, versiones por OT, una principal, transición de estado, vincular a una OT. Ver sección 11 | 3 días |
| **3** | **HECHA.** Tickets: hilo, notas internas, tomar, derivar, conversión a OT con herencia. Ver sección 12 | 1,5 sem |
| **4** | **HECHA (2026-09-22).** SLA hábil + notificaciones. Ver sección 13 | 1 sem |
| 5 | Portal público + correo saliente | 1 sem |
| 6 | Ingesta de correo (IMAP primero, Graph después) | 1 sem |
| 7 | Dashboard + búsqueda | 4 días |

Orden de necesidad del frontend: `/usuarios` y `/clientes` → `/ots/kanban` → `/ots/:id` → `/tickets` → `/notificaciones/resumen` → `/dashboard`. Dashboard por consulta directa (sin materializar). Búsqueda con `pg_trgm` + GIN y `UNION ALL` de 4 ramas con `LIMIT 5`.

## 10. Fase 1 (OT núcleo): estado y desvíos

Implementada y cubierta por tests (contrato de la API en `api.md`). Sin cambios de esquema (la migración `EsquemaInicial` bastó). Lo que la implementación añade o decide respecto de este documento:

- **Eventos**: además de los previstos se añade `horas_eliminadas` (borrar horas también se audita). `ot_editada` lleva la lista de campos cambiados (no valores); `comentario` lleva el id del comentario, no el texto.
- **Derivación y concurrencia**: cada operación que muta una OT toma `UPDLOCK` sobre su fila (`bloquearOt`), lo que serializa las escrituras por OT. Además, la derivación compara el responsable que el actor vio al empezar con el de dentro de la transacción: si cambió, responde `409 CONFLICTO_CONCURRENCIA` (así dos derivaciones simultáneas, incluso de admin/gestion, dan exactamente un ganador). Los errores 2627/2601/1205/50001 de la BD se traducen al mismo 409 (`conflictoConcurrencia`, red de seguridad). Si la derivación cae en el mismo milisegundo que el inicio del tramo, `hasta` se corre 1 ms (el CHECK exige `hasta > desde`); cerrar y abrir usan el mismo instante, tomado del reloj de la BD.
- **Notificaciones**: la derivación inserta la fila (`tipo=derivacion`); el API de lectura llega en la fase 4.
- **Horas** (resuelto): un `tecnico` registra **solo las propias y solo en OT donde es responsable actual o colaborador** (`puedeRegistrarHoras`); puede borrar solo las suyas sin exigir relación con la OT (`puedeGestionarHoras`). Para entrar a una OT ajena puede añadirse a sí mismo como colaborador (`puedeAgregarColaborador`); esto le concede también editar, cambiar estado y adjuntar, según la matriz.
- **Lectura de listas**: se añadieron `GET /ots/:id/comentarios|horas|etapas` (la tabla de la sección 4 solo listaba POST/DELETE en algunos).
- **Kanban**: devuelve `data: [{estado,total,ots:[tarjeta]}]` (arreglo, para conservar el orden de columnas); tres consultas fijas. Sin paginación: incluye todas las OT que cumplan el filtro.
- **Listado**: `q` usa `LIKE ... ESCAPE` con parámetro (escapa la barra invertida, `%`, `_` y `[`); `desde/hasta` cuentan el día en hora de Chile (`AT TIME ZONE`).
- **Adjuntos**: multer en memoria (tope 10 MB), extensión **y** MIME deben coincidir con la lista blanca (415 si no); descarga solo si `estado = limpio`. `storage_key` = sha256 y no sale en el API. `Antivirus` es una interfaz con `NoopAntivirus` (deja `limpio` sin escanear y avisa en el log al arrancar): **el adjunto NO está escaneado** hasta integrar ClamAV. No hay endpoint de borrado de adjuntos en esta fase. `ADJUNTOS_DIR` (por defecto `./storage/adjuntos`, ignorado por git).
- **OT interna**: al crear, una OT no interna con `areaInterna` (o una interna con `clienteId`) se rechaza con 400, no solo lo que el CHECK impediría.
- **SLA**: los campos `sla_*` de `ot` no se calculan todavía (default `en_plazo`, vencimiento `NULL`).
- **Cambios en Fase 0**: solo `dbErrors.ts` (se añade `conflictoConcurrencia`), `env.ts` (`ADJUNTOS_DIR`), `app.ts`/`server.ts` (rutas y aviso de antivirus), `vitest.config.ts` y `globalSetup.ts` (carpeta de adjuntos de test y su limpieza al terminar).

## 11. Fase 2 (Cotizaciones): estado y desvíos

Implementada y cubierta por tests (contrato de la API en `api.md`). Sin cambios de esquema: la tabla `cotizacion` de la migración `EsquemaInicial` (incluido el índice único filtrado de `es_principal`) bastó tal cual. Lo que la implementación añade o decide respecto de este documento:

- **RBAC de lectura**: la sección 4 lista `GET/POST /cotizaciones` con un único rol mínimo "gestion", pero la sección 6 solo restringe las acciones de escritura (crear/editar/enviar/aprobar) a admin/gestion. Se implementó como en el resto de la API: `GET /cotizaciones` y `GET /cotizaciones/:id` con rol mínimo `lectura` (cualquiera puede ver), y `POST/PATCH/estado/vincular` con rol mínimo `gestion`. A diferencia de OT, no hay permiso por fila: ni `tecnico` responsable ni colaborador de la OT vinculada tienen excepción alguna (`cotizacion.policy.ts`, verificado con un test explícito).
- **Evento genérico**: `evento.service.ts` se generalizó sin romper la firma de `registrarEventoOt(manager, otId, actorId, evento)` (sigue igual). Se extrajo la inserción SQL cruda a una función interna `insertarEvento(manager, entidadTipo, entidadId, actorId, tipo, payload)`, y se agregó `registrarEventoCotizacion(manager, cotizacionId, actorId, evento)` que valida contra un `eventoCotizacionSchema` nuevo (discriminatedUnion propio, distinto del de OT). También se agregaron tres tipos a `eventoOtSchema`: `cotizacion_creada`, `cotizacion_vinculada`, `cotizacion_estado_cambiado` (todos con `cotizacionId` en el payload).
- **Timeline propio de una cotización (`GET /cotizaciones/:id`)**: en vez de duplicar cada evento en las dos entidades, cada tipo de evento vive en un solo lugar. `cotizacion_editada` y `cotizacion_estado_cambiado` se escriben con `entidad_tipo='cotizacion'` (dueño: la cotización). `cotizacion_creada` y `cotizacion_vinculada` se escriben solo con `entidad_tipo='ot'` (dueño: la OT; no tienen copia del lado cotización). El detalle de la cotización combina ambos orígenes con una consulta `OR`: eventos propios, más los eventos de la OT de esos dos tipos cuyo payload referencia su `cotizacionId` (`JSON_VALUE`). Se decidió así (y no reflejar también `cotizacion_estado_cambiado` como evento "propio" duplicado) para que ninguna transición aparezca dos veces en el timeline de la cotización.
- **Reflejo en el timeline de la OT**: `cotizacion_estado_cambiado` se escribe siempre del lado cotización, y además (solo si la cotización tiene `otId`) una segunda fila con `entidad_tipo='ot'` para que `GET /ots/:id` la muestre en su propio `eventos`. Es la única duplicación intencional del diseño: vive dos veces en la tabla `evento`, pero cada detalle (OT y cotización) solo la muestra una vez cada uno.
- **Concurrencia de `esPrincipal`**: se reutiliza `bloquearOt` (el mismo `UPDLOCK` que ya serializa toda escritura sobre una OT) como barrera antes de leer `MAX(version)` y de desmarcar la principal anterior, en vez de confiar solo en el índice único filtrado de la BD. Dos altas "principal" simultáneas para la misma OT: ambas se crean (201), pero solo la que se confirma después de la otra queda con `esPrincipal: true` (test de concurrencia en `cotizacion.crear.test.ts`).
- **`POST /ots/:id/cotizaciones/vincular`**: cotización sin `otId` se vincula en cualquier estado y su `version` se recalcula (`MAX(version de la OT)+1`); cotización que ya pertenecía a OTRA OT solo se puede reasignar si no está `aprobada` ni `rechazada` (`409 COTIZACION_NO_VINCULABLE`, evita tocar historial cerrado por error) y **conserva su `version`** al reasignarse (el diseño no pide recalcularla en ese caso). Volver a vincular a la MISMA OT es un no-op seguro (no reordena versión ni rompe `esPrincipal`).
- **`GET /ots/:id`**: el campo `cotizaciones` (antes fijo en `[]`) ahora lista todas las cotizaciones de la OT ordenadas por `version` descendente, con `{id, numero, montoClp, estado, version, esPrincipal, fecha}`. Consulta cruda separada (no el repositorio de `Cotizacion`) para evitar un ciclo de imports con `cotizacion.service.ts`, que ya importa `escaparLike` y `obtenerDetalleOt` desde `ot.service.ts`.
- **Cliente en cotizaciones ligadas a una OT no interna**: si no se especifica `clienteId`, se autocompleta con `ot.clienteId`; si se especifica y no coincide, `400 CLIENTE_NO_COINCIDE`. Si la OT es interna, no se exige ni se contrasta `clienteId` (puede ir sin cliente, o con uno si igual se especifica). El mismo criterio aplica al editar `clienteId` por `PATCH`.
- **`anuladaEn`**: no se usa en esta fase (no hay endpoint de anular una cotización); queda `NULL` siempre, tal como pide el alcance.
- **Sin cambios en Fase 0/1** más allá de lo ya descrito arriba (`evento.service.ts` generalizado, `ot.service.ts` completando `cotizaciones` en el detalle, y `ot.controller.ts`/`ot.routes.ts` con el endpoint de vincular).

## 12. Fase 3 (Tickets): estado y desvíos

Implementada y cubierta por tests (contrato de la API en `api.md`). Sin cambios de esquema: las tablas `ticket`, `mensaje_ticket` y `ticket_ot` de la migración `EsquemaInicial` bastaron tal cual. Lo que la implementación añade o decide respecto de este documento:

- **Punto 1 — sin colaborador en ticket** (decisión ya tomada por el encargo, documentada aquí como pide): el esquema no tiene `ticket_colaborador`. `policies/ticket.policy.ts` es una versión de `ot.policy.ts` sin `esColaborador` en `ContextoTicket` ni las funciones que dependían de él; donde la sección 6 dice "responsable o colaborador" para un ticket, la implementación exige solo "responsable actual". `POST /tickets/:id/derivar` no acepta `mantenerComoColaborador` (`.strict()` lo rechaza si viene).

- **Generalización de la mecánica de tramos (punto 6)**: antes de esta fase, `ot.derivacion.service.ts::derivarOt` tenía `'ot'` escrito a mano en dos `INSERT`/`UPDATE` de `asignacion` (cerrar el tramo abierto, abrir uno nuevo). Se extrajo a `services/asignacion.service.ts`:
  - `moverTramoResponsable(manager, {entidadTipo, entidadId, destinoId, motivoEntrada, derivadoPorId})`: cierra el tramo abierto (si existe) y abre uno nuevo, parametrizada por `entidad_tipo` ('ot' | 'ticket'). Incluye el ajuste de 1 ms que ya tenía `derivarOt` para el CHECK `hasta > desde`.
  - `notificarDerivacion(manager, destinoId, entidadTipo, entidadId, titulo, cuerpo)`: inserta la fila de `notificacion` (no aplica a "tomar": ahí el actor es su propio destino).
  - `derivarOt`, `derivarTicket` y `tomarTicket` usan ambas funciones. **Lo que NO se generalizó, a propósito**: actualizar `responsable_actual_id` de la entidad (cada una es un repositorio TypeORM tipado distinto — `Ot` vs `Ticket` — y su propio `m.save()` dispara `ActualizadoEnSubscriber`; el llamador ya tenía la entidad cargada para sus propias validaciones) y el **evento** (`registrarEventoOt` vs. el nuevo `registrarEventoTicket`, con `discriminatedUnion` distintos: OT tiene `mantuvoComoColaborador` en `derivado` porque hay colaboradores que pueden quedar; ticket tiene un tipo `tomado` que OT no tiene, porque una OT siempre nace con responsable y un ticket no). Archivos tocados por esta generalización: `services/asignacion.service.ts` (nuevo), `services/ot.derivacion.service.ts` (usa las dos funciones en vez del SQL a mano; ya no importa `Notificacion` ni `randomUUID` directamente).
  - Mismo criterio de bloqueo optimista que ya usaba `ot.derivacion.service.ts`: `derivarTicket` compara el responsable "visto" antes de la transacción contra el real dentro de ella (`409 CONFLICTO_CONCURRENCIA` si cambió). `tomarTicket` no lo necesita: `bloquearTicket` (mismo `UPDLOCK` que `bloquearOt`) ya serializa dos "tomar" simultáneos, y el segundo ve el `responsableActualId` ya puesto por el primero (`409 TICKET_YA_ASIGNADO`).

- **Generalización de adjuntos (punto 4)**: `validations/adjunto.validation.ts` cambió `entidadTipo: z.literal("ot")` a `z.nativeEnum(EntidadAdjunto)` (`ot|ticket|mensaje`). `services/adjunto.service.ts::subirAdjunto` ganó un parámetro `entidadTipo` y una función interna `autorizarSubida` que despacha el permiso según la entidad: `ot` usa `ot.policy.ts` (sin cambios de comportamiento), `ticket` usa `ticket.policy.ts` (solo responsable actual/gestion/admin), y `mensaje` resuelve el ticket dueño del mensaje y aplica el mismo permiso que publicar mensajes en ese ticket. `abrirAdjunto` **no cambió**: ya era agnóstico de `entidadTipo` (solo mira `estado`/`storageKey`). La cuota de 25 MB sigue siendo por `(entidadTipo, entidadId)`, ahora parametrizada en vez de fija a `'ot'`.
  - **Decisión de diseño para adjuntar a un mensaje** (el encargo dejaba el criterio abierto): el flujo normal sube el archivo ANTES del mensaje con `entidadTipo=ticket` (queda "suelto" del ticket) y `POST /tickets/:id/mensajes` lo asocia pasando su id en `adjuntoIds`, que simplemente hace `UPDATE adjunto SET entidad_tipo='mensaje', entidad_id=<mensajeId> WHERE ... entidad_tipo='ticket' AND entidad_id=<ticketId>` dentro de la misma transacción del mensaje (`ticket.mensaje.service.ts`). Si algún id no era un adjunto suelto de ese ticket, `400 ADJUNTO_INVALIDO` y se revierte todo. Subir directo con `entidadTipo=mensaje` a un mensaje ya existente también está soportado en el servicio (mismo permiso), por si hace falta adjuntar después de crear el mensaje, pero no es el camino que usa el panel.

- **`POST /tickets/:id/mensajes`**: `tipo` restringido por Zod a `respuesta_cliente | nota_interna` (nunca `cliente`). Reglas de estado exactamente como las describe el encargo: `nota_interna` nunca toca el estado; `respuesta_cliente` fija `primeraRespuestaEn` la primera vez (chequeo `=== null`, nunca se pisa) y, si el estado era `nuevo`, pasa a `abierto`; en cualquier otro estado (`abierto`, `esperando_cliente`, `resuelto`, `cerrado`) el mensaje se agrega sin tocar el estado. `cerrado` no estaba explícitamente mencionado en el encargo junto a `esperando_cliente`/`resuelto`: se trató igual (no se reabre), por ser la lectura más simple y consistente de "solo `nuevo` se mueve".

- **`POST /tickets/:id/tomar`**: solo si `responsableActualId IS NULL` (`409 TICKET_YA_ASIGNADO`). Rol mínimo `tecnico` (cualquiera, sin relación previa con el ticket). Abre el primer tramo con `motivoEntrada` y `derivadoPorId` en `NULL`. Evento `tomado {usuarioId}`.

- **`POST /tickets/:id/derivar`**: idéntico a la derivación de OT salvo sin `mantenerComoColaborador`. Reutiliza `moverTramoResponsable`/`notificarDerivacion`.

- **`POST /tickets/:id/convertir-a-ot`** (punto 8): herencia completa tal como la especifica el encargo — `origen` mapeado desde `canal` (tabla fija en el servicio), `clienteId` heredado o exigido, `recepcionadoPor` de la OT = `recepcionadoPor` del ticket (nunca el actor), cadena de responsables copiada tramo a tramo (mismos `usuario`, `desde`, `hasta`, `motivoEntrada`, `derivadoPor`) con SQL directo (mismo motivo que en `crearOt`/`derivarOt`: `asignacion` tiene un trigger y TypeORM añadiría `OUTPUT`, que SQL Server rechaza en tablas con triggers). Caso borde documentado: si el ticket nunca se tomó (cadena vacía), la OT arranca con un único tramo abierto para quien convierte. La validación de consistencia `esInterna`/`clienteId`/`areaInterna` se **factorizó** desde `validations/ot.validation.ts` (antes vivía inline en el `.superRefine()` de `crearOtReq`) a una función pura `problemasConsistenciaInterna({esInterna, clienteId, areaInterna})`, porque en la conversión esos valores se resuelven en el servicio (pueden heredarse del ticket) y no pueden validarse dentro de un `superRefine` atado directamente al body. `crearOtReq` ahora llama a esa misma función; `ticket.conversion.service.ts` también. El evento `creado` de `eventoOtSchema` se extendió con `origenTicketId`/`origenTicketNumero` opcionales (compatible hacia atrás, `.strict()` sigue rechazando cualquier otro campo de más).

- **`POST/DELETE /tickets/:id/ots[/:otId]`** (punto 9): vincula/desvincula una OT existente sin herencia; el vínculo manual siempre nace con `esOrigen: false`, así que nunca puede violar el índice único filtrado `uq_ticket_ot_origen`. Desvincular no deshace nada de lo ya heredado en la OT por una conversión previa (son mecanismos independientes a propósito: la herencia es un hecho histórico, el vínculo es solo navegación).

- **`GET /ots/:id`**: el campo `tickets` (antes fijo en `[]`, mismo comentario que tenían `cotizaciones` y `tickets` antes de sus respectivas fases) ahora lista los tickets vinculados vía `ticket_ot`, el de origen primero, con `{id, numero, asunto, estado, canal, esOrigen}`.

- **Sin cambios en Fase 0/1/2** más allá de lo ya descrito arriba (`evento.service.ts` con `eventoTicketSchema`/`registrarEventoTicket` nuevos y el `creado` de OT extendido; `ot.service.ts` completando `tickets` en el detalle; `ot.derivacion.service.ts` usando `asignacion.service.ts`; `adjunto.service.ts`/`adjunto.validation.ts`/`adjunto.controller.ts` generalizados; `ot.validation.ts` con `problemasConsistenciaInterna` factorizada). Un test preexistente de Fase 1 (`adjunto.routes.test.ts`, caso "validaciones del multipart") se actualizó: antes `entidadTipo=ticket` se rechazaba en Zod (`400`); ahora es válido a nivel de esquema y, como el id usado en ese test es una OT (no un ticket real), el resultado pasó a `404 TICKET_NO_ENCONTRADO`.

## 13. Fase 4 (SLA hábil + notificaciones): estado y desvíos

Implementada y cubierta por tests (contrato de la API en `api.md`). **Sin migración nueva**: las tablas `sla_config`, `calendario_laboral`, `feriado`, `sla_pausa`, `notificacion` y los campos `sla_*` de `ot`/`ticket` ya existían desde la migración `EsquemaInicial` de la Fase 0; esta fase solo los empieza a calcular y a exponer.

- **`sumarHorasHabiles`** vive en `src/sla/horasHabiles.ts`, función pura (sin BD) con Luxon, exactamente con la firma que pedía el encargo. El mismo archivo agrega `horasHabilesEntre(inicio, fin, calendario, feriados, zona)`, el complemento natural (horas hábiles transcurridas entre dos instantes): la usan el job (minutos hábiles restantes hasta el vencimiento) y el cierre de una pausa (minutos hábiles que duró). No estaba nombrada en el encargo, pero es la misma mecánica interna (ventana del día + feriado) que `sumarHorasHabiles`, así que no tenía sentido reimplementarla aparte. Ambas están probadas exhaustivamente en `src/sla/horasHabiles.test.ts` (19 casos): horario, antes/después de la ventana, fin de semana, feriado, cruce de jornada, cruce de fin de semana, cruce de feriado en medio, `horas=0` (dos variantes), un tramo que acumula varios días, el plazo exacto hasta el cierre, y dos casos reales de cruce de horario de verano de Chile en 2026 (fin del DST 2026-04-04/05 GMT-3→GMT-4, inicio del DST 2026-09-05/06 GMT-4→GMT-3; fechas de transición confirmadas con `Intl.DateTimeFormat` contra la tzdata del sistema, no supuestas). El resto del cálculo (carga de calendario/feriados desde BD, orquestación) vive en `src/services/sla.calculo.service.ts`.
- **`usarHorasHabiles=false`**: el encargo permite editar este campo por `PUT /sla/config` pero no pedía explícitamente implementar la rama alternativa; se implementó de todos modos por consistencia (si el campo es editable, debe hacer algo): con `false`, el vencimiento es `fechaIngreso + horas` de reloj corridas, sin tocar calendario ni feriados. Sin test dedicado (la semilla y todos los tests dejan `usarHorasHabiles=true`).
- **Cuándo se calcula**: `ot.service.ts::crearOt` y `ticket.service.ts::crearTicket` fijan `fechaIngreso` explícitamente con `ahoraDb(m)` **antes** del `INSERT` (en vez de dejar el `DEFAULT SYSDATETIMEOFFSET()` de la columna, que antes se usaba tal cual), porque el vencimiento de SLA de la MISMA fila se calcula a partir de esa fecha y hacía falta el valor antes de construir la fila, no después. Es el mismo patrón que ya usaban para el primer tramo de `asignacion`. `ticket.conversion.service.ts::convertirATicketOt` hace lo mismo para la OT nacida de una conversión, que tiene su **propio** reloj (su `fechaIngreso` es "ahora", no la del ticket) y su propio vencimiento de resolución — el ticket conserva el suyo, de "contestar al cliente". Cambio de prioridad (`PATCH /ots/:id`, `PATCH /tickets/:id`) recalcula desde la `fechaIngreso` YA guardada (no la toca), con la nueva prioridad.
- **Exposición en el DTO de ticket**: `ticket.service.ts::obtenerDetalleTicket` ahora expone `slaResolucionVenceEn`/`slaRespuestaVenceEn` (antes el detalle de ticket solo traía `slaEstado`, sin los vencimientos — ver `api.md` de la Fase 3). Necesario para que el vencimiento calculado en esta fase sea visible/verificable por el frontend y por los tests; es el único cambio de forma del DTO de ticket en esta fase.
- **Pausa de SLA** (`services/sla.pausa.service.ts`, invocado desde `ticket.service.ts::cambiarEstadoTicket` en la misma transacción que ya cambiaba el estado): al entrar a `esperando_cliente` abre `sla_pausa` solo si `sla_config[prioridad].pausarEnEsperaCliente`; al salir, si había una pausa abierta, la cierra y corre `slaResolucionVenceEn` (y `slaRespuestaVenceEn` si `primeraRespuestaEn` sigue `NULL`) hacia adelante exactamente las horas hábiles que duró (`horasHabilesEntre` para medir, `sumarHorasHabiles` anclada en el vencimiento existente para correrlo — nunca un recálculo desde cero).
- **El job no evalúa una entidad pausada** (`sla_pausado_desde IS NOT NULL`): decisión no escrita palabra por palabra en el encargo, pero se sigue directamente de "el SLA se pausa" — si el job igual comparara `ahora` contra el vencimiento congelado de un ticket en `esperando_cliente`, terminaría marcándolo `vencida` mientras está pausado, contradiciendo el propósito de pausar. Documentado también como comentario en `jobs/slaJob.ts`.
- **Notificación solo en la escalada**: el job (`evaluarSla`) actualiza `sla_estado` en cualquier transición (incluida una des-escalada, p. ej. `vencida → en_plazo` tras subir el plazo en `PUT /sla/config` o tras la primera respuesta de un ticket que cambia de fase), pero solo **notifica** cuando el nuevo valor es `por_vencer` o `vencida` — nunca en una des-escalada. Es la lectura más simple de "ambas transiciones... generan una notificación" (las dos que menciona el encargo son justamente esas dos escaladas).
- **Fase de `sla_estado` de un ticket**: antes de `primeraRespuestaEn` (`NULL`), el job compara contra `slaRespuestaVenceEn`; después, contra `slaResolucionVenceEn`. El cambio de fase no dispara un recálculo inmediato al momento de responder (`ticket.mensaje.service.ts` no se tocó): lo recoge el siguiente ciclo del job (máx. 5 min de rezago), que es más simple y ya estaba implícito en "el job cada 5 min actualiza sla_estado".
- **`PUT /sla/config`**: body `{ configs: [{ prioridad, ...campos opcionales }] }` (1 a 3 filas, sin repetir prioridad) — no había una forma fija en el encargo, se eligió un arreglo de filas parciales por ser lo más directo de validar con Zod y lo más cercano a "actualiza una o más filas". Cada fila editada dispara `recalcularAbiertosPorPrioridad` en la misma transacción (bucle de `UPDATE`s, no una sola sentencia — con ~8 usuarios el volumen es trivial, tal como pedía el encargo).
- **`GET /notificaciones/resumen`**: se decidió que fuera el panorama de **todo el equipo**, no solo lo propio del actor (el encargo dejaba el criterio abierto y sugería documentar la alternativa). Cada campo es `{ total, items }` con `items` acotado a los primeros 5 `{id,numero}` (se agregó la lista, no solo pedida, "útil para el frontend" según el propio encargo). `otPendientesCotizarOAprobar` = `estado='en_cotizacion'` OR alguna cotización de esa OT en `estado='enviada'` (interpretación literal de "alguna cotización propia en 'enviada'": propia de la OT, no del usuario). Si Felipe prefiere "solo lo mío", es un cambio acotado a `notificacion.service.ts::resumenNotificaciones` (agregar el filtro por responsable/actor en cada una de las 4 subconsultas).
- **`SlaConfig`/`Notificacion` en los tests**: `sla_config` está en la lista `CON_SEMILLA` de `test/helpers.ts` (no se trunca entre tests), pero la Fase 4 agrega el primer endpoint que la MUTA (`PUT /sla/config`); se agregó a `limpiarBD` un `UPDATE` que la devuelve a los valores de la semilla en cada `beforeEach`, para que un test no deje el valor filtrado hacia los siguientes archivos (la suite corre en serie contra una sola BD).
- **Bug encontrado y corregido en el camino**: `Feriado.fecha` es una PK asignada a mano (no generada). `repo.save()` de TypeORM decide INSERT vs UPDATE mirando si la entidad ya trae la PK puesta; con una PK manual eso lo llevaba a hacer un upsert silencioso (pisaba el feriado existente en vez de violar la restricción) en un `fecha` duplicado. `feriado.service.ts::crearFeriado` usa `repo.insert()` en su lugar, que siempre emite un INSERT real y sí dispara el 2627 que `violacionUnica`/`409 FERIADO_YA_EXISTE` esperan. Es la única entidad del esquema con una PK no generada, así que ninguna otra parte del código tenía este problema.
- **`api/worker.ts`**: proceso separado (mismo patrón que `server.ts`, mismo `AppDataSource`), `node-cron` (`*/5 * * * *`), corre `evaluarSla()` una vez al arrancar y luego según el cron. Sin Docker Compose ni PM2 todavía (fuera de alcance, es de despliegue). Script `"worker": "tsx watch src/api/worker.ts"` en `package.json`, mismo patrón que `"dev"`.
- **Nuevas dependencias**: `luxon` + `@types/luxon` (cálculo de horas hábiles) y `node-cron` (que trae sus propios tipos, sin `@types/node-cron`). Ninguna otra.
