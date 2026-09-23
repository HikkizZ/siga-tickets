# siga-ot — Contrato de la API (Fases 0 a 7)

Documento vivo: lista **todos los endpoints implementados**. La fuente de verdad del diseño es `backend-diseno.md`; si algo difiere, este archivo describe lo que el código hace hoy. Estado: Fase 0 (auth, usuarios, clientes), Fase 1 (OT núcleo, adjuntos), Fase 2 (cotizaciones), Fase 3 (tickets: hilo, tomar/derivar, conversión a OT), Fase 4 (SLA en horas hábiles + notificaciones), Fase 5 (portal público + correo saliente), Fase 6 (ingesta de correo, IMAP) y Fase 7 (dashboard + búsqueda global) implementadas.

## Convenciones

- Base: `/api/v1`. Salvo `POST /auth/login`, todo exige `Authorization: Bearer <jwt>`. Si el token está por vencer, la respuesta trae `X-Renewed-Token` (guárdalo y úsalo en las siguientes).
- Éxito: `{ "status": "ok", "data": ..., "meta"?: {...} }`. Listados paginados: `meta: { page, perPage, total }`.
- Error: `{ "status": "error", "code": "...", "message": "...", "details"?: [...] }`. Errores de validación: `400 VALIDATION_ERROR` con `details: [{ campo, mensaje }]`.
- Cuerpos JSON con esquema **estricto**: un campo no previsto devuelve 400 (p. ej. `recepcionadoPorId`).
- IDs: uuid en minúsculas. Fechas con hora: ISO 8601 UTC (`2026-09-21T14:03:11.123Z`). Fechas de negocio: `YYYY-MM-DD`.
- Roles (cada uno incluye a los de abajo): `lectura` < `tecnico` < `gestion` < `admin`. "Rol mínimo" = filtro grueso; además hay **permisos por fila** en OT (ver abajo).
- Referencias a usuario en respuestas: siempre `{ id, nombre }`.

### Errores comunes

| HTTP | code | Cuándo |
|---|---|---|
| 400 | `VALIDATION_ERROR` / `INVALID_JSON` | Body/params/query inválidos |
| 401 | `UNAUTHENTICATED` / `INVALID_TOKEN` | Sin token, token inválido o usuario desactivado |
| 403 | `FORBIDDEN` | Rol insuficiente (filtro grueso) |
| 403 | `PERMISO_DENEGADO` | Rol suficiente pero sin relación con la OT (permiso por fila) |
| 404 | `OT_NO_ENCONTRADA`, `TICKET_NO_ENCONTRADO`, `MENSAJE_NO_ENCONTRADO`, `TICKET_OT_NO_ENCONTRADO`, `NOT_FOUND` | Recurso inexistente |
| 409 | `CONFLICTO_CONCURRENCIA` | Otra operación ganó una carrera (derivación/toma simultánea); reintenta |
| 409 | `TICKET_YA_ASIGNADO` | `POST /tickets/:id/tomar` sobre un ticket que ya tiene responsable |
| 409 | `TICKET_OT_YA_VINCULADO` | `POST /tickets/:id/ots` con un par ticket/OT ya vinculado |
| 404 | `CORREO_INGERIDO_NO_ENCONTRADO` | `POST /correos-ingeridos/:id/reprocesar` con un id inexistente (Fase 6) |
| 409 | `CORREO_INGERIDO_NO_REPROCESABLE` | `POST /correos-ingeridos/:id/reprocesar` sobre un correo que no está en `estado='error'` (Fase 6) |
| 500 | `INTERNAL_ERROR` | Error no controlado (nunca trae detalle) |

### Permisos por fila (OT y tickets)

`admin`/`gestion`: sin restricción. `tecnico` en **OT**:

| Acción | Condición |
|---|---|
| Editar, cambiar estado, comentar, adjuntar | responsable actual **o** colaborador |
| Derivar | solo el responsable actual |
| Etapas; añadir/quitar colaboradores | solo el responsable actual (además, cualquier `tecnico` puede añadirse a sí mismo como colaborador) |
| Horas | registrar: solo las propias y solo si eres responsable o colaborador de la OT; borrar: solo las propias (sin exigir relación con la OT) |

`tecnico` en **tickets** (Fase 3) — **sin colaborador**: el esquema no tiene una tabla `ticket_colaborador` (a diferencia de `ot_colaborador`). Donde el diseño hablaba de "responsable o colaborador" para un ticket, en la práctica es solo "responsable actual":

| Acción | Condición |
|---|---|
| Editar, cambiar estado, publicar mensajes (nota interna o respuesta), adjuntar | solo el responsable actual |
| Derivar | solo el responsable actual |
| Tomar (`POST /tickets/:id/tomar`) | cualquier `tecnico`, solo si el ticket no tiene responsable |
| Convertir a OT, vincular/desvincular OT | nunca — solo `gestion`/`admin`, sin excepción por fila |

`lectura` solo lee y descarga en ambos casos.

---

## Auth

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| POST | `/auth/login` | — | Login |
| GET | `/auth/me` | cualquiera | Perfil propio |
| POST | `/auth/password` | cualquiera | Cambiar contraseña propia |

**POST /auth/login** — body `{ "username": "admin", "password": "..." }` → `200 { data: { token, user: Usuario } }`. Errores: `401 INVALID_CREDENTIALS` (idéntico exista o no el usuario), `429 RATE_LIMITED` (5 intentos / 15 min por IP).

**GET /auth/me** → `200 { data: { user: Usuario } }`.

**POST /auth/password** — body `{ "currentPassword": "...", "newPassword": "..." }` (8–72 caracteres) → `200 { data: null }`. Error: `403 WRONG_PASSWORD`.

`Usuario`: `{ id, username, nombre, cargo, email, rol, activo, mustChangePassword, creadoEn, actualizadoEn }`.

## Usuarios (admin)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/usuarios` | Lista de `Usuario` (incluye al usuario técnico `sistema`, inactivo) |
| POST | `/usuarios` | Crea. Body `{ username, nombre, cargo?, email, password, rol }` → `201 Usuario`. `409 CONFLICT` si username/email existen o username = `sistema` |
| PATCH | `/usuarios/:id` | Body parcial `{ nombre?, cargo?, email?, rol?, activo?, password? }` → `Usuario`. `409` si el admin intenta desactivarse/quitarse el rol; `403` sobre `sistema` |

## Clientes

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/clientes` | lectura | `[{ id, nombre, activo }]` ordenado por nombre |
| POST | `/clientes` | admin | Body `{ nombre }` → `201`. `409 CONFLICT` si el nombre existe |
| PATCH | `/clientes/:id` | admin | Body `{ nombre?, activo? }` |

---

## OT

### GET /ots — lista paginada · lectura

Query (todo opcional): `page` (≥1, def. 1), `perPage` (1–100, def. 25), `orden` ∈ `numero | titulo | estado | prioridad | fechaIngreso | fechaEstimadaTermino | creadoEn | actualizadoEn` (def. `fechaIngreso`; otro valor → 400), `dir` = `asc|desc` (def. `desc`), y filtros `estado`, `prioridad`, `categoria`, `clienteId`, `responsableId`, `mios=true` (soy responsable o colaborador), `q` (busca en `numero`, `titulo`, `solicitanteNombre`; `%`, `_` y `[` se toman literalmente), `desde`/`hasta` (`YYYY-MM-DD`, sobre la fecha de ingreso en hora de Chile).

```
GET /api/v1/ots?estado=en_ejecucion&mios=true&orden=prioridad&dir=asc&page=1&perPage=25
```
```json
{ "status": "ok",
  "data": [{
    "id": "…", "numero": "OT-1041", "titulo": "Mantención de bomba",
    "cliente": { "id": "…", "nombre": "Minera Los Andes" }, "areaInterna": null, "esInterna": false,
    "categoria": "mantencion", "prioridad": "media", "origen": "telefono", "estado": "ingresado",
    "solicitanteNombre": "Juan Pérez", "responsable": { "id": "…", "nombre": "…" },
    "fechaIngreso": "2026-09-21T14:03:11.123Z", "fechaEstimadaTermino": "2026-10-01", "slaEstado": "en_plazo"
  }],
  "meta": { "page": 1, "perPage": 25, "total": 1 } }
```
(`cliente` es `null` en OT internas; `areaInterna` es `null` en las demás.)

### GET /ots/kanban · lectura

Mismos filtros que el listado (sin paginación ni orden). Devuelve siempre las 6 columnas, en este orden: `ingresado, en_cotizacion, aprobado, en_ejecucion, terminado, facturado`. Más recientes primero dentro de cada columna. Tres consultas fijas, sin N+1.

```json
{ "status": "ok", "data": [
  { "estado": "ingresado", "total": 1, "ots": [{
      "id": "…", "numero": "OT-1041", "titulo": "…",
      "cliente": { "id": "…", "nombre": "…" }, "areaInterna": null,
      "prioridad": "media", "responsable": { "id": "…", "nombre": "…" },
      "colaboradores": { "items": [{ "id": "…", "nombre": "…" }], "total": 1 },
      "fechaEstimadaTermino": null, "adjuntosCount": 0, "slaEstado": "en_plazo" }] },
  { "estado": "en_cotizacion", "total": 0, "ots": [] } ] }
```
`colaboradores.items` trae como máximo 3; `total` es la cantidad real.

### POST /ots · tecnico

```json
{ "titulo": "Mantención de bomba", "descripcion": "Revisar la bomba principal",
  "clienteId": "…", "categoria": "mantencion", "prioridad": "media", "origen": "telefono",
  "ubicacion": "Planta 2", "solicitanteNombre": "Juan Pérez", "solicitanteContacto": "juan@cliente.cl",
  "fechaEstimadaTermino": "2026-10-01", "responsableId": "…", "colaboradorIds": ["…"] }
```
- `categoria` ∈ `mantencion|instalacion|reparacion|cotizacion|soporte|otro`; `prioridad` ∈ `alta|media|baja`; `origen` ∈ `mesa_ayuda|correo|telefono|presencial|interna`.
- OT interna: `"esInterna": true` + `areaInterna` y **sin** `clienteId`. No interna (por defecto): `clienteId` obligatorio (existente y activo) y sin `areaInterna`. Combinación inválida → `400 VALIDATION_ERROR`; cliente inexistente/inactivo → `400 CLIENTE_INVALIDO`.
- `responsableId` opcional (por defecto, quien crea); debe ser un usuario activo distinto de `sistema` (`400 RESPONSABLE_INVALIDO`). `colaboradorIds` no puede incluir al responsable (`400 COLABORADOR_INVALIDO`).
- `recepcionadoPorId` **no** se acepta: sale del token.
- Folio `OT-xxxx` consecutivo sin huecos; estado inicial `ingresado`; abre el primer tramo de la cadena; evento `creado`.

→ `201 { data: <Detalle> }`.

### GET /ots/:id · lectura

`data` (**Detalle**):

```json
{ "id": "…", "numero": "OT-1041", "titulo": "…", "descripcion": "…",
  "estado": "ingresado", "prioridad": "media", "categoria": "mantencion", "origen": "telefono",
  "esInterna": false, "cliente": { "id": "…", "nombre": "…" }, "areaInterna": null,
  "ubicacion": null, "solicitanteNombre": null, "solicitanteContacto": null,
  "fechaIngreso": "…", "fechaEstimadaTermino": null, "terminadoEn": null,
  "slaEstado": "en_plazo", "slaResolucionVenceEn": null, "creadoEn": "…", "actualizadoEn": "…",
  "recepcionadoPor": { "id": "…", "nombre": "…" },
  "responsable": { "id": "…", "nombre": "…" },
  "colaboradores": [{ "id": "…", "nombre": "…" }],
  "cadenaResponsables": [{
    "id": "…", "usuario": { "id": "…", "nombre": "…" },
    "desde": "…", "hasta": "…|null", "duracionSeg": 3600, "actual": false,
    "motivoEntrada": "…|null", "derivadoPor": { "id": "…", "nombre": "…" } }],
  "etapas": [{ "id": "…", "nombre": "…", "fechaInicio": "2026-09-01", "fechaTermino": "2026-09-05", "orden": 1 }],
  "horas": { "total": 3.75, "items": [{ "id": "…", "usuario": {…}, "fecha": "2026-09-01", "horas": 1.5, "detalle": null, "creadoEn": "…" }] },
  "comentarios": [{ "id": "…", "autor": {…}, "cuerpo": "…", "visibleCliente": false, "creadoEn": "…" }],
  "adjuntos": [{ "id": "…", "nombre": "informe.pdf", "mime": "application/pdf", "tamanoBytes": 1234, "estado": "limpio", "subidoPor": {…}, "creadoEn": "…" }],
  "eventos": [{ "id": "12", "tipo": "derivado", "actor": {…}, "payload": { }, "ocurridoEn": "…" }],
  "cotizaciones": [{
    "id": "…", "numero": "COT-2042", "montoClp": 500000, "estado": "enviada",
    "version": 2, "esPrincipal": true, "fecha": "2026-09-21" }],
  "tickets": [{ "id": "…", "numero": "TK-0001", "asunto": "No enciende el equipo", "estado": "abierto", "canal": "telefono", "esOrigen": true }] }
```
- `cadenaResponsables`: orden cronológico; el tramo abierto lleva `actual: true`, `hasta: null` y `duracionSeg` = lo transcurrido hasta ahora; el primero tiene `motivoEntrada` y `derivadoPor` en `null`.
- `eventos`: más recientes primero (timeline).
- `tickets` (Fase 3): tickets vinculados vía `ticket_ot` (conversión o vínculo manual), el de origen primero (`esOrigen: true`); `[]` si no hay ninguno.
- `cotizaciones` (Fase 2): **todas** las cotizaciones de la OT (no solo la principal), ordenadas por `version` descendente. El detalle completo de cada una (cliente, timeline propio) está en `GET /cotizaciones/:id`.
- `slaEstado`/`slaResolucionVenceEn`: calculados desde la Fase 4 (`fechaIngreso` + horas hábiles de resolución según la prioridad; ver sección "SLA y notificaciones (Fase 4)" más abajo). Antes de la Fase 4 quedaban en su default (`en_plazo`/`null`).

### PATCH /ots/:id · tecnico (responsable o colaborador)

Body parcial: `titulo, descripcion, categoria, prioridad, ubicacion, solicitanteNombre, solicitanteContacto, fechaEstimadaTermino` (los opcionales aceptan `null`), y `clienteId` (solo OT no interna) o `areaInterna` (solo OT interna). No se pueden cambiar `numero`, `estado`, `responsable`, `recepcionadoPor` (400). Solo los campos que cambian generan evento (`prioridad_cambiada` para la prioridad, `ot_editada` para el resto). → `200 Detalle`.

### POST /ots/:id/estado · tecnico (responsable o colaborador)

Único camino para cambiar el estado. Body `{ "estado": "en_ejecucion" }`. Cualquier estado distinto del actual es válido. Mismo estado → `409 ESTADO_SIN_CAMBIO`. `terminadoEn` se fija la primera vez que pasa a `terminado` o `facturado` y no se borra al retroceder. → `200 Detalle`.

### POST /ots/:id/derivar · responsable actual, gestion, admin

```json
{ "destinoId": "…", "motivo": "Se requiere otra especialidad", "mantenerComoColaborador": false }
```
- `motivo` ≥ 10 caracteres. `destinoId` = usuario activo, no `sistema`, ≠ responsable actual → si no, `400 DERIVACION_INVALIDA`.
- Un `tecnico` que no es el responsable actual (aunque sea colaborador) → `403 PERMISO_DENEGADO`.
- Transacción única: cierra el tramo abierto, abre el nuevo (con motivo y quién derivó), actualiza el responsable, evento `derivado` y una notificación (`tipo: "derivacion"`) para el destino. Si el destino era colaborador, deja de serlo; con `mantenerComoColaborador` el responsable anterior pasa a colaborador. El SLA no se toca.
- Derivaciones simultáneas sobre la misma OT: gana una; la otra recibe `409 CONFLICTO_CONCURRENCIA`.

→ `200 Detalle`.

### Colaboradores · responsable actual, gestion, admin (y `tecnico` para añadirse a sí mismo)

- `POST /ots/:id/colaboradores` body `{ "usuarioId": "…" }` → `201 [{ id, nombre }]` (lista completa). Cualquier `tecnico` puede añadirse a sí mismo (`usuarioId` = el suyo) a cualquier OT; añadir a otra persona exige ser responsable actual, gestion o admin (si no, `403 PERMISO_DENEGADO`); `lectura` siempre `403`. Genera el evento `colaborador_agregado` con el propio usuario como actor. Errores: `403 PERMISO_DENEGADO`, `400 COLABORADOR_INVALIDO` (es el responsable, inactivo, `sistema` o no existe), `409 COLABORADOR_DUPLICADO`.
- `DELETE /ots/:id/colaboradores/:usuarioId` → `200 { data: null }`; `404 COLABORADOR_NO_ENCONTRADO`.

### Comentarios

- `GET /ots/:id/comentarios` · lectura → `[{ id, autor, cuerpo, visibleCliente, creadoEn }]` (más recientes primero).
- `POST /ots/:id/comentarios` · tecnico (responsable o colaborador). Body `{ "cuerpo": "…", "visibleCliente": false }` (interno por defecto) → `201` con el comentario.

### Horas

- `GET /ots/:id/horas` · lectura → `{ total, items: [...] }`.
- `POST /ots/:id/horas` · tecnico. Body `{ "fecha": "2026-09-01", "horas": 1.5, "detalle": "…", "usuarioId": "…" }`. `horas` en (0, 24], máx. 2 decimales. `usuarioId` solo lo pueden usar gestion/admin (un tecnico que lo envíe con otro id → `403`). → `201 { hora, total }`. Un `tecnico` solo puede registrar en una OT donde es el responsable actual o colaborador; si no, `403 PERMISO_DENEGADO`. gestion/admin: cualquier OT y cualquier `usuarioId`.
- `DELETE /ots/:id/horas/:horaId` · tecnico solo las suyas; gestion/admin cualquiera → `200 { total }`; `404 HORA_NO_ENCONTRADA`.

### Etapas · lectura para GET; responsable actual, gestion, admin para escribir

- `GET /ots/:id/etapas` → `[{ id, nombre, fechaInicio, fechaTermino, orden }]` ordenado por `orden`.
- `POST /ots/:id/etapas` body `{ "nombre": "Diagnóstico", "fechaInicio": "2026-09-01", "fechaTermino": "2026-09-05", "orden": 3 }` (`orden` opcional: por defecto al final) → `201`.
- `PATCH /ots/:id/etapas/:etapaId` body parcial → `200`.
- `DELETE /ots/:id/etapas/:etapaId` → `200 { data: null }`.
- `fechaTermino < fechaInicio` → `400 VALIDATION_ERROR` (también si solo se envía una de las fechas y contradice la guardada). `404 ETAPA_NO_ENCONTRADA`.

### POST /ots/:id/cotizaciones/vincular · gestion, admin (Fase 2)

Liga una cotización **existente** (sin OT, o de otra OT) a esta OT. Body `{ "cotizacionId": "…" }`.

- La cotización no puede estar `aprobada` ni `rechazada` si ya pertenecía a OTRA OT distinta → `409 COTIZACION_NO_VINCULABLE` (evita reasignar historial cerrado por error). Una cotización sin OT se vincula en cualquier estado; volver a vincular a la MISMA OT no hace nada raro (no reordena versión ni pisa nada).
- Si la cotización no tenía `otId`, se le asigna `version = MAX(version de esa OT) + 1`; si ya tenía una OT (se está reasignando), conserva su `version`.
- Si `esPrincipal` de la cotización es `true`, aplica la regla de "una sola principal": la que era principal de esta OT deja de serlo, en la misma transacción.
- Evento `cotizacion_vinculada` en el timeline de la OT.
- `404 OT_NO_ENCONTRADA` / `404 COTIZACION_NO_ENCONTRADA`.

→ `200 { data: <Detalle de la OT> }` (mismo formato que `GET /ots/:id`, con la cotización ya en `cotizaciones`).

---

## Cotizaciones (Fase 2)

A diferencia de OT, **no hay permiso por fila**: solo `gestion` y `admin` escriben (crear, editar, cambiar estado, vincular), sin excepción aunque un `tecnico` sea responsable o colaborador de la OT vinculada. Lectura (`GET`): cualquier rol autenticado, `lectura` incluido.

`Cotizacion` (forma común de list/detalle, salvo lo indicado): `{ id, numero, ot: {id,numero,titulo}|null, cliente: {id,nombre}|null, montoClp, fecha, estado, version, esPrincipal, creadoEn, actualizadoEn }`. El detalle (`GET /cotizaciones/:id`) además trae `aprobadaEn` y `eventos`.

### GET /cotizaciones — lista paginada · lectura

Query: `page` (≥1, def. 1), `perPage` (1–100, def. 25), `orden` ∈ `numero | fecha | montoClp | estado | version | creadoEn | actualizadoEn` (def. `fecha`; otro valor → 400), `dir` = `asc|desc` (def. `desc`), y filtros `estado`, `clienteId`, `otId`, `q` (número o nombre de cliente; `%`, `_` y `[` literales, mismo escape que OT), `desde`/`hasta` (`YYYY-MM-DD`, sobre `fecha`).

```
GET /api/v1/cotizaciones?estado=enviada&orden=fecha&dir=desc&page=1&perPage=25
```
```json
{ "status": "ok",
  "data": [{
    "id": "…", "numero": "COT-2042", "ot": { "id": "…", "numero": "OT-1041", "titulo": "…" },
    "cliente": { "id": "…", "nombre": "…" }, "montoClp": 500000, "fecha": "2026-09-21",
    "estado": "enviada", "version": 2, "esPrincipal": true,
    "creadoEn": "…", "actualizadoEn": "…" }],
  "meta": { "page": 1, "perPage": 25, "total": 1 } }
```

### POST /cotizaciones · gestion, admin

```json
{ "otId": "…", "clienteId": "…", "montoClp": 500000, "fecha": "2026-09-21", "esPrincipal": false }
```
Todos los campos son opcionales salvo `montoClp` (entero ≥ 0; negativo o decimal → `400`). `estado` no se acepta en el body: siempre nace en `borrador`.

- Con `otId`: la OT debe existir (`404 OT_NO_ENCONTRADA`). Si la OT **no** es interna: sin `clienteId` se autocompleta con el de la OT; con `clienteId` que no coincide → `400 CLIENTE_NO_COINCIDE`. Si la OT **es** interna, no se exige `clienteId`.
- Sin `otId`, `clienteId` es obligatorio (`400 VALIDATION_ERROR`).
- `clienteId` (el dado o el autocompletado) debe ser un cliente existente y activo → `400 CLIENTE_INVALIDO`.
- `version`: `MAX(version)+1` entre las cotizaciones de la misma OT, o `1` si no hay `otId` o es la primera de esa OT.
- `esPrincipal: true`: si la OT ya tenía una principal, la anterior deja de serlo en la misma transacción (bloqueo explícito de la fila de la OT: dos altas "principal" simultáneas para la misma OT nunca dejan dos filas `esPrincipal: true`).
- Folio `COT-xxxx` consecutivo sin huecos (`siguienteFolio`). Si hay `otId`, evento `cotizacion_creada` en el timeline de la OT.

→ `201 { data: <Cotizacion> }`.

### GET /cotizaciones/:id · lectura

`data`: los campos comunes más `aprobadaEn` y `eventos` (el timeline propio de la cotización): eventos con `entidadTipo=cotizacion` de esta cotización (`cotizacion_editada`, `cotizacion_estado_cambiado`), más los eventos de la OT que **solo** existen ahí (`cotizacion_creada`, `cotizacion_vinculada` — referencian la cotización por `cotizacionId` en su payload). El cambio de estado se escribe una sola vez, del lado cotización, y por eso no se duplica al combinar ambos orígenes. `404 COTIZACION_NO_ENCONTRADA`.

```json
{ "id": "…", "numero": "COT-2042", "ot": {"id":"…","numero":"OT-1041","titulo":"…"}, "cliente": {"id":"…","nombre":"…"},
  "montoClp": 500000, "fecha": "2026-09-21", "estado": "enviada", "version": 2, "esPrincipal": true,
  "aprobadaEn": null, "creadoEn": "…", "actualizadoEn": "…",
  "eventos": [{ "id": "9", "tipo": "cotizacion_estado_cambiado", "actor": {"id":"…","nombre":"…"}, "payload": {"de":"borrador","a":"enviada"}, "ocurridoEn": "…" }] }
```

### PATCH /cotizaciones/:id · gestion, admin

Solo si `estado = 'borrador'` (`409 COTIZACION_ESTADO_INVALIDO` si no). Body parcial `{ montoClp?, fecha?, clienteId? }` (mismas validaciones que la creación; cambiar `clienteId` en una cotización con OT no interna exige que siga coincidiendo con el de la OT). Sin campos que cambien de verdad → `200` sin evento. Si algo cambia, evento `cotizacion_editada` con `campos` y `montoClpAntes`/`montoClpDespues`. `404 COTIZACION_NO_ENCONTRADA`.

### POST /cotizaciones/:id/estado · gestion, admin

Body `{ "estado": "enviada" }`. Transiciones válidas: `borrador→enviada`, `enviada→aprobada`, `enviada→rechazada`, `enviada→borrador`, `rechazada→enviada`. Cualquier otra (incluida la misma → la misma, o saltarse estados) → `409 TRANSICION_INVALIDA`. Al llegar a `aprobada` por primera vez fija `aprobadaEn` (no se pisa después). Evento `cotizacion_estado_cambiado` siempre del lado cotización; si tiene `otId`, se refleja también en el timeline de la OT (mismo `de`/`a`, más `cotizacionId`).

---

## Tickets (Fase 3, SLA extendido en Fase 4)

Panel interno únicamente (`/api/v1`, JWT). Fuera de alcance: portal público, ingesta/envío de correo (fases 5-6). El cálculo de SLA (`slaEstado`, `slaResolucionVenceEn`, `slaRespuestaVenceEn`) y la lectura de notificaciones se agregaron en la Fase 4 — ver la sección "SLA y notificaciones (Fase 4)" más abajo.

**Sin colaborador**: a diferencia de OT, el esquema no tiene `ticket_colaborador`. Todo lo que en la matriz de la sección 6 del diseño dice "responsable o colaborador" para un ticket es, en la implementación, solo "responsable actual" (ver tabla de permisos por fila más arriba).

`TicketResumen` (forma de `GET /tickets`): `{ id, numero, asunto, canal, prioridad, estado, cliente: {id,nombre}|null, solicitanteNombre, responsable: {id,nombre}|null, fechaIngreso, slaEstado }`.

### GET /tickets — lista paginada · lectura

Query: `page` (≥1, def. 1), `perPage` (1–100, def. 25), `orden` ∈ `numero | asunto | estado | prioridad | fechaIngreso | creadoEn | actualizadoEn` (def. `fechaIngreso`), `dir` = `asc|desc` (def. `desc`), y filtros `estado`, `prioridad`, `canal`, `responsable` (uuid), `mios=true` (soy el responsable actual), `sinAsignar=true` (`responsable_actual_id IS NULL`), `q` (busca en `numero`, `asunto`, `solicitanteNombre`; `%`, `_` y `[` literales, mismo escape que OT), `desde`/`hasta` (`YYYY-MM-DD`, sobre `fechaIngreso` en hora de Chile).

```
GET /api/v1/tickets?sinAsignar=true&prioridad=alta&orden=fechaIngreso&dir=asc
```
```json
{ "status": "ok",
  "data": [{ "id": "…", "numero": "TK-0001", "asunto": "No enciende el equipo", "canal": "telefono",
    "prioridad": "media", "estado": "nuevo", "cliente": null, "solicitanteNombre": "Juan Pérez",
    "responsable": null, "fechaIngreso": "…", "slaEstado": "en_plazo" }],
  "meta": { "page": 1, "perPage": 25, "total": 1 } }
```

### POST /tickets · tecnico

```json
{ "asunto": "No enciende el equipo", "descripcion": "El PC de recepción no enciende",
  "solicitanteNombre": "Juan Pérez", "solicitanteEmail": "juan@cliente.cl", "solicitanteTelefono": "+56...",
  "solicitanteEmpresa": "…", "clienteId": "…", "canal": "telefono", "prioridad": "media" }
```
- `canal` ∈ `telefono|presencial|interno` **solamente** (`portal`/`correo` son de fases futuras: el portal público y la ingesta de correo crean tickets por otro camino) → si no, `400 VALIDATION_ERROR`.
- `recepcionadoPorId` **no** se acepta: sale del token (`400` si se envía, `.strict()`).
- `clienteId` opcional; si viene, debe ser un cliente existente y activo (`400 CLIENTE_INVALIDO`).
- Nace **sin responsable** (`responsable: null`) y en estado `nuevo`: alguien lo debe tomar (`POST /tickets/:id/tomar`), incluido quien lo creó si quiere.
- Folio `TK-xxxx` consecutivo sin huecos; evento `creado`.

→ `201 { data: <Detalle> }`.

### GET /tickets/:id · lectura

`data` (**Detalle**):

```json
{ "id": "…", "numero": "TK-0001", "asunto": "…", "descripcion": "…",
  "solicitanteNombre": "…", "solicitanteEmail": "…", "solicitanteTelefono": null, "solicitanteEmpresa": null,
  "cliente": null, "canal": "telefono", "prioridad": "media", "estado": "abierto",
  "fechaIngreso": "…", "recepcionadoPor": { "id": "…", "nombre": "…" },
  "responsable": { "id": "…", "nombre": "…" },
  "primeraRespuestaEn": "…|null", "resueltoEn": null, "cerradoEn": null,
  "slaEstado": "en_plazo", "slaResolucionVenceEn": "…|null", "slaRespuestaVenceEn": "…|null",
  "creadoEn": "…", "actualizadoEn": "…",
  "cadenaResponsables": [{
    "id": "…", "usuario": { "id": "…", "nombre": "…" },
    "desde": "…", "hasta": "…|null", "duracionSeg": 120, "actual": true,
    "motivoEntrada": "…|null", "derivadoPor": { "id": "…", "nombre": "…" }|null }],
  "mensajes": [{
    "id": "…", "tipo": "nota_interna", "autor": { "id": "…", "nombre": "…" }, "autorExterno": null,
    "cuerpo": "…", "adjuntos": [], "creadoEn": "…" }],
  "adjuntos": [{ "id": "…", "nombre": "foto.jpg", "mime": "image/jpeg", "tamanoBytes": 1234, "estado": "limpio", "subidoPor": {…}, "creadoEn": "…" }],
  "ots": [{ "id": "…", "numero": "OT-1041", "titulo": "…", "estado": "ingresado", "esOrigen": true }],
  "eventos": [{ "id": "5", "tipo": "tomado", "actor": {…}, "payload": { "usuarioId": "…" }, "ocurridoEn": "…" }] }
```
- `cadenaResponsables`: vacía si el ticket nunca se tomó (nace sin responsable, no abre tramo hasta el primer `tomar`/`derivar`). Mismo formato que OT.
- `mensajes`: el hilo completo, en orden cronológico, **incluye notas internas** (esto es el panel interno, no el portal). Cada mensaje trae sus propios `adjuntos` (los re-parentados a él); `adjuntos` a nivel de ticket son los que aún no se asociaron a ningún mensaje ("sueltos").
- `ots`: OT(s) vinculadas vía `ticket_ot`, la de origen primero.
- `eventos`: más recientes primero (timeline); también expuesto en `GET /tickets/:id/eventos`.

### PATCH /tickets/:id · tecnico (solo responsable actual)

Body parcial: `asunto?, descripcion?, prioridad?`. Nunca `numero`, `estado`, `canal`, `recepcionadoPor`, `responsable` (`.strict()` los rechaza con `400`). Solo los campos que cambian generan evento (`prioridad_cambiada` para la prioridad, `ticket_editado` para el resto). → `200 Detalle`.

### POST /tickets/:id/estado · tecnico (solo responsable actual)

Único camino para cambiar el estado. Body `{ "estado": "resuelto" }`, cualquiera de `nuevo|abierto|esperando_cliente|resuelto|cerrado` distinto del actual (sin máquina de transiciones estricta todavía). Mismo estado → `409 ESTADO_SIN_CAMBIO`. `resueltoEn`/`cerradoEn` se fijan la primera vez que se llega a `resuelto`/`cerrado` y no se borran si el ticket se reabre manualmente. Evento `estado_cambiado`. → `200 Detalle`.

### POST /tickets/:id/tomar · tecnico

Sin body. Solo si el ticket no tiene responsable (`responsableActualId IS NULL`); si ya lo tiene → `409 TICKET_YA_ASIGNADO`. Cualquier `tecnico` (o gestion/admin) puede tomar un ticket libre, no hace falta ninguna relación previa. Abre el primer tramo de la cadena con `motivoEntrada: null` y `derivadoPor: null` (nadie se lo entregó). Evento `tomado`. Dos "tomar" simultáneos sobre el mismo ticket: gana exactamente uno, el otro `409`. → `200 Detalle`.

### POST /tickets/:id/mensajes · tecnico (solo responsable actual)

```json
{ "tipo": "respuesta_cliente", "cuerpo": "Estamos revisando el equipo", "adjuntoIds": ["…"] }
```
- `tipo` ∈ `respuesta_cliente | nota_interna` **solamente**: `cliente` se rechaza por Zod (esos mensajes los crea el portal o la ingesta de correo, fases futuras).
- `nota_interna`: nunca cambia el estado del ticket.
- `respuesta_cliente`: si es la primera respuesta del equipo en la vida del ticket, fija `primeraRespuestaEn` (una sola vez) y, si el estado era `nuevo`, pasa a `abierto`. Si el ticket estaba `esperando_cliente`, `resuelto` o `cerrado`, **no lo reabre** (reabrir es cosa de una respuesta del cliente, que no existe en esta fase): el mensaje se agrega al hilo sin tocar el estado.
- `adjuntoIds` opcional: ids de adjuntos ya subidos sueltos a este ticket (`POST /adjuntos` con `entidadTipo=ticket`); se re-parentan al mensaje recién creado. Un id que no sea un adjunto suelto de este ticket → `400 ADJUNTO_INVALIDO`.
- Evento en el ticket: `respuesta_cliente` o `nota_interna`, con `{ mensajeId }`.

→ `201 { data: <mensaje con adjuntos ya re-parentados> }` (no el detalle completo del ticket).

### POST /tickets/:id/derivar · responsable actual, gestion, admin

```json
{ "destinoId": "…", "motivo": "Se requiere otra especialidad" }
```
Igual que `POST /ots/:id/derivar`, pero **sin** `mantenerComoColaborador` (el ticket no tiene colaboradores; si se envía, `.strict()` lo rechaza con `400`). Mismas reglas: `motivo` ≥ 10 caracteres, `destinoId` = usuario activo, no `sistema`, ≠ responsable actual (`400 DERIVACION_INVALIDA`); un `tecnico` que no es el responsable actual → `403 PERMISO_DENEGADO`; derivaciones simultáneas → gana una, la otra `409 CONFLICTO_CONCURRENCIA`. Evento `derivado {de,a,motivo}` y notificación (`tipo: "derivacion"`) para el destino. → `200 Detalle`.

### POST /tickets/:id/convertir-a-ot · gestion, admin

"Herencia completa" del ticket hacia una OT nueva:

```json
{ "titulo": "…", "descripcion": "…", "categoria": "soporte", "prioridad": "alta",
  "ubicacion": "…", "fechaEstimadaTermino": "2026-10-01", "clienteId": "…", "areaInterna": "…", "esInterna": false }
```
- `categoria` es obligatorio; el resto opcional. `titulo`/`descripcion` por defecto vienen de `asunto`/`descripcion` del ticket; `prioridad` por defecto la del ticket.
- `origen` de la OT se deriva del `canal` del ticket, **no editable**: `portal→mesa_ayuda`, `correo→correo`, `telefono→telefono`, `presencial→presencial`, `interno→interna`.
- `clienteId`: si no viene y el ticket tiene cliente, se hereda; si el ticket no tiene cliente y no se indica `esInterna`, `400 CLIENTE_INVALIDO`. Consistencia `esInterna`/`clienteId`/`areaInterna` reutiliza el mismo chequeo que `POST /ots` (`400 VALIDATION_ERROR` con el mismo mensaje si es inconsistente).
- `solicitanteNombre`/`solicitanteContacto` de la OT se completan desde el solicitante del ticket (email o teléfono).
- `recepcionadoPor` de la OT = quien **recibió el ticket originalmente** (nunca quien ejecuta la conversión).
- **Cadena de responsables**: se copian TODOS los tramos de `asignacion` del ticket (mismo `usuario`, `desde`, `hasta`, `motivoEntrada`, `derivadoPor`) como tramos de la OT, en el mismo orden. Si el ticket nunca se tomó, la OT arranca con un único tramo abierto para quien convierte.
- `ticket_ot`: se inserta `{ esOrigen: true }`.
- Evento `creado` en la OT, con `origenTicketId`/`origenTicketNumero` además de los campos habituales. Evento `vinculado_ot {otId,otNumero,esOrigen:true}` en el ticket.
- Todo en una sola transacción.

→ `201 { data: <Detalle de la OT> }` (mismo formato que `GET /ots/:id`).

### POST/DELETE /tickets/:id/ots[/:otId] · gestion, admin

Vincula o desvincula una OT **ya existente**, sin herencia (distinto de convertir-a-ot).

- `POST /tickets/:id/ots` body `{ "otId": "…" }` → inserta el vínculo con `esOrigen: false` (el índice único filtrado de la BD solo permite un origen por OT, y este camino nunca lo pisa). Repetir el mismo par → `409 TICKET_OT_YA_VINCULADO`. `404 OT_NO_ENCONTRADA` / `404 TICKET_NO_ENCONTRADO`. Evento `vinculado_ot {otId,otNumero,esOrigen:false}` en el ticket. → `201 { data: <Detalle del ticket> }`.
- `DELETE /tickets/:id/ots/:otId` → quita el vínculo (sea o no el de origen); **no deshace** lo ya heredado en la OT por una conversión previa, es solo la referencia cruzada de navegación. `404 TICKET_OT_NO_ENCONTRADO` si no estaban vinculados. Evento `ot_desvinculada {otId,otNumero}` en el ticket. → `200 { data: null }`.

### GET /tickets/:id/eventos · lectura

Timeline del ticket, más recientes primero. Misma forma que `eventos` en el detalle.

---

## Adjuntos

### POST /adjuntos · tecnico (responsable de la OT/ticket destino; gestion/admin siempre)

`multipart/form-data` con los campos `entidadTipo` ∈ `ot|ticket|mensaje` (Fase 3: generalizado desde `ot`), `entidadId=<uuid de la OT, ticket o mensaje>` y el archivo en el campo **`archivo`** (un solo archivo).

```
curl -H "Authorization: Bearer $TOKEN" -F entidadTipo=ot -F entidadId=$OT_ID -F "archivo=@informe.pdf;type=application/pdf" $BASE/api/v1/adjuntos
curl -H "Authorization: Bearer $TOKEN" -F entidadTipo=ticket -F entidadId=$TICKET_ID -F "archivo=@foto.jpg;type=image/jpeg" $BASE/api/v1/adjuntos
```
→ `201 { data: { id, nombre, mime, tamanoBytes, estado, subidoPor, creadoEn } }`.

- Lista blanca de **extensión y MIME** (deben corresponderse): pdf, png, jpg/jpeg, gif, webp, doc, docx, xls, xlsx, ppt, pptx, txt, csv, zip. Otro tipo → `415 ADJUNTO_TIPO_NO_PERMITIDO`.
- Máx. 10 MB por archivo (`413 ADJUNTO_MUY_GRANDE`) y 25 MB por `(entidadTipo, entidadId)` (`413 ADJUNTO_CUOTA_EXCEDIDA`). Archivo vacío o multipart mal formado → `400 ADJUNTO_INVALIDO`; entidad inexistente → `404 OT_NO_ENCONTRADA` / `404 TICKET_NO_ENCONTRADO` / `404 MENSAJE_NO_ENCONTRADO`.
- Permiso: `entidadTipo=ot` usa `ot.policy.ts` (responsable actual, colaborador, o gestion/admin); `entidadTipo=ticket` y `entidadTipo=mensaje` usan `ticket.policy.ts` (solo el responsable actual del ticket, o gestion/admin — sin colaborador).
- El nombre original se sanea (sin rutas) y solo se guarda para mostrarlo; en disco el archivo se llama como su sha256. `estado` queda `limpio` sin escaneo real (ver diseño: antivirus pendiente).
- **Adjuntar a un mensaje de ticket**: el flujo normal del panel sube el archivo ANTES del mensaje con `entidadTipo=ticket` (queda "suelto" del ticket) y luego lo asocia pasando su `id` en `adjuntoIds` al crear el mensaje (`POST /tickets/:id/mensajes`), que lo re-parenta a `entidadTipo=mensaje`. Subir directo con `entidadTipo=mensaje` a un mensaje ya existente también funciona (mismo permiso), pero no es el camino que usa el panel.

### GET /adjuntos/:id/descargar · lectura

Stream autenticado (el frontend debe pedirlo con el token, p. ej. `fetch` + `blob`, no con un `<a href>` sin cabecera). Respuesta con `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox`, `Cache-Control: private, no-store`. Errores: `404 ADJUNTO_NO_ENCONTRADO`, `409 ADJUNTO_NO_DISPONIBLE` (estado distinto de `limpio`).

---

## SLA y notificaciones (Fase 4)

El vencimiento de SLA (`slaResolucionVenceEn` en OT; `slaResolucionVenceEn`/`slaRespuestaVenceEn` en ticket) se calcula al crear la entidad y se recalcula al cambiar la prioridad (siempre desde `fechaIngreso`, nunca desde "ahora"), al editar `sla_config` (en lote, solo lo abierto de esa prioridad) y al cerrar una pausa de SLA. `sla_estado` (`en_plazo|por_vencer|vencida`) lo actualiza el worker cada 5 min (`jobs/slaJob.ts::evaluarSla`, programado con `node-cron` en `api/worker.ts`; también corre una vez al arrancar el proceso), nunca las escrituras directas. Detalle completo del diseño, desviaciones y ejemplos de `sumarHorasHabiles` en `backend-diseno.md` sección 3.

### GET /sla/config · lectura

`200 { data: [{ prioridad, horasResolucion, horasPrimeraRespuesta, usarHorasHabiles, pausarEnEsperaCliente, umbralPorVencer }] }` (las 3 filas, `alta|media|baja`).

### PUT /sla/config · admin

```json
{ "configs": [
  { "prioridad": "alta", "horasResolucion": 24, "horasPrimeraRespuesta": 2, "usarHorasHabiles": true, "pausarEnEsperaCliente": true, "umbralPorVencer": 0.2 }
] }
```
- `configs`: 1 a 3 filas, sin repetir `prioridad`; todos los campos de cada fila son opcionales salvo `prioridad` (solo se actualiza lo enviado). `horasResolucion`/`horasPrimeraRespuesta`: entero > 0. `umbralPorVencer`: decimal en (0, 1]. Fuera de rango → `400 VALIDATION_ERROR`. `500`/defensivo interno: `400 SLA_CONFIG_INVALIDO` si la prioridad no tiene fila (no debería ocurrir: la semilla siembra las 3 y Zod ya restringe el enum).
- Por cada prioridad editada, recalcula en la MISMA transacción el vencimiento de toda OT/ticket **abierto** (no terminal) de esa prioridad, desde su propia `fechaIngreso`.
- → `200 { data: [...] }` (mismo formato que el GET, con los 3 valores ya actualizados).

### GET /sla/feriados · lectura

`200 { data: [{ fecha, nombre, irrenunciable }] }` ordenado por fecha.

### POST /sla/feriados · admin

Body `{ "fecha": "2026-09-18", "nombre": "Fiestas Patrias", "irrenunciable": true }` (`irrenunciable` opcional, por defecto `false`) → `201 { data: { fecha, nombre, irrenunciable } }`. `fecha` duplicada → `409 FERIADO_YA_EXISTE`.

### DELETE /sla/feriados/:fecha · admin

`200 { data: null }`. Fecha inexistente → `404 FERIADO_NO_ENCONTRADO`. Sin endpoint para editar `calendario_laboral` en esta fase (el horario semanal se siembra por migración; se edita solo por script/BD).

---

## Notificaciones (Fase 4)

`Notificacion`: `{ id, tipo, entidadTipo, entidadId, titulo, cuerpo, leidaEn, creadoEn }`. `tipo` incluye `derivacion` (ya existía desde la Fase 1/3) y, nuevas de esta fase, `sla_por_vencer`/`sla_vencida` (las genera `evaluarSla`, solo en el instante en que `slaEstado` transiciona a uno de esos dos valores, y solo si la entidad tiene responsable actual).

### GET /notificaciones — lista paginada · cualquiera

Solo las del usuario autenticado (nunca las de otro). Query: `page`, `perPage` (mismos defaults que el resto de la API), `soloNoLeidas` (booleano). Orden `creadoEn DESC`.

```
GET /api/v1/notificaciones?soloNoLeidas=true
```
→ `200 { data: [Notificacion], meta: { page, perPage, total } }`.

### GET /notificaciones/resumen · cualquiera

Panorama operativo de **todo el equipo** (no solo lo propio del actor — decisión de esta fase, ver `backend-diseno.md`; si se prefiere que sea solo lo propio, queda como cambio menor pendiente). Cada campo es `{ total, items }`, con `items` limitado a los 5 primeros `{id, numero}` (para que el frontend pueda enlazar directo sin otra consulta):

```json
{ "status": "ok", "data": {
  "otVencidas": { "total": 2, "items": [{ "id": "…", "numero": "OT-1042" }] },
  "otPrioridadAltaAbiertas": { "total": 1, "items": [...] },
  "otPendientesCotizarOAprobar": { "total": 3, "items": [...] },
  "ticketsNuevosSinResponder": { "total": 5, "items": [...] }
} }
```
- `otVencidas`: `sla_estado='vencida'` y no terminal.
- `otPrioridadAltaAbiertas`: `prioridad='alta'` y no terminal.
- `otPendientesCotizarOAprobar`: `estado='en_cotizacion'` **o** alguna cotización propia en `estado='enviada'`.
- `ticketsNuevosSinResponder`: `estado='nuevo'`.

### POST /notificaciones/:id/leer · cualquiera

Marca la notificación como leída (`leidaEn=ahora`, solo si aún era `null`; repetir es un no-op) → `200 { data: null }`. Si el id no existe **o** es de otro usuario, el código es el mismo (`404 NOTIFICACION_NO_ENCONTRADA`) a propósito: nunca se revela con el código si la notificación existe pero es ajena.

### POST /notificaciones/leer-todas · cualquiera

Marca todas las no leídas del actor → `200 { data: null }`. No toca las de otro usuario.

---

## Eventos de auditoría (`eventos[].tipo` en el detalle de OT)

`creado`, `estado_cambiado {de,a}`, `prioridad_cambiada {de,a}`, `derivado {de,a,motivo,mantuvoComoColaborador}`, `comentario {comentarioId,visibleCliente}`, `horas_registradas {horaId,usuarioId,fecha,horas}`, `horas_eliminadas {horaId,usuarioId,horas}`, `colaborador_agregado|colaborador_quitado {usuarioId}`, `etapa_creada|etapa_eliminada {etapaId}`, `etapa_editada {etapaId,campos}`, `adjunto_agregado {adjuntoId,mime,tamanoBytes}`, `ot_editada {campos}`, `cotizacion_creada {cotizacionId,numero}` (Fase 2, solo si la cotización nació con `otId`), `cotizacion_vinculada {cotizacionId,numero}` (Fase 2), `cotizacion_estado_cambiado {cotizacionId,de,a}` (Fase 2, reflejo del evento que ya vive en el timeline de la cotización). Los payloads guardan ids, no copias de datos personales.

## Eventos de auditoría propios de una cotización (`eventos[].tipo` en `GET /cotizaciones/:id`)

`cotizacion_editada {campos,montoClpAntes,montoClpDespues}`, `cotizacion_estado_cambiado {de,a}`. La creación y la vinculación no tienen copia del lado cotización: se leen desde el timeline de la OT (ver arriba) cuando la cotización tiene `otId`; sin `otId`, esos dos eventos simplemente no existen.

## Eventos de auditoría de un ticket (`eventos[].tipo` en el detalle de ticket, Fase 3)

`creado {numero,canal,recepcionadoPorId,clienteId}`, `estado_cambiado {de,a}`, `prioridad_cambiada {de,a}`, `ticket_editado {campos}`, `tomado {usuarioId}` (sin equivalente en OT: un ticket puede tomarse solo, una OT siempre nace con responsable), `derivado {de,a,motivo}` (sin `mantuvoComoColaborador`: el ticket no tiene colaboradores), `respuesta_cliente {mensajeId}`, `nota_interna {mensajeId}`, `adjunto_agregado {adjuntoId,mime,tamanoBytes}`, `vinculado_ot {otId,otNumero,esOrigen}` (`esOrigen:true` si vino de `convertir-a-ot`, `false` si fue un vínculo manual), `ot_desvinculada {otId,otNumero}`.

El evento `creado` de una **OT** nacida de una conversión (Fase 3) extiende el payload habitual con `origenTicketId`/`origenTicketNumero`, para componer "creada desde TK-000X por [actor]".

## Otros

- `GET /health` (sin JWT) → `{ status: "ok", data: { db: "ok" } }`; `503 DB_UNAVAILABLE` si la base no responde.

---

## Pública (Fase 5)

Base: `/publico` (sin prefijo `/api/v1`, sin JWT interno). Mismo envelope `{status, data}` que el resto de la API. Dos grupos:

- **Sin autenticación** (`POST /publico/tickets`, `POST /publico/tickets/seguimiento`): exigen `captchaToken` (ver "Captcha" abajo) y están detrás de un rate limiter.
- **Con token de portal** (el resto): exigen `Authorization: Bearer <token de portal>`, un JWT propio con `{ scope: "portal", ticketId }`, TTL **15 minutos**, emitido por `POST /publico/tickets/seguimiento`. `authenticate` (interno) rechaza explícitamente cualquier token con `scope: "portal"`; `authenticatePortal` rechaza cualquier token que no lo tenga. Ninguno de los dos endpoints revela si el fallo fue por token ajeno o expirado (siempre `401 INVALID_TOKEN`).

### Captcha

`NoopCaptcha` (por defecto, `CAPTCHA_PROVIDER=noop`) aprueba cualquier `captchaToken` **no vacío**: hoy el portal no está protegido de verdad contra bots, solo el flujo ya queda cableado. `captchaToken` vacío o ausente → `400 VALIDATION_ERROR`. Un proveedor real (Turnstile/hCaptcha) devolvería `400 CAPTCHA_INVALIDO` cuando el token es inválido; con `NoopCaptcha` ese código nunca ocurre en la práctica.

### POST /publico/tickets — crear ticket desde el portal

`multipart/form-data`. Campos de texto:

```
nombre, correo, empresa? (→ solicitanteEmpresa), asunto, descripcion, prioridad? (default "media"), captchaToken
```

Y archivos opcionales en el campo **`adjuntos`** (varios, mismas reglas de MIME/extensión/tamaño que `POST /adjuntos`, ver arriba). `canal` es siempre `'portal'` (no viene del body). `recepcionadoPor` = el usuario técnico `sistema`. Nace `estado: 'nuevo'`, sin responsable. Folio `TK-xxxx`; SLA calculado igual que la creación interna.

```
curl -F nombre="Juan Pérez" -F correo="juan@cliente.cl" -F asunto="No enciende el equipo" \
     -F descripcion="El PC de recepción no enciende" -F captchaToken=x \
     -F "adjuntos=@foto.jpg;type=image/jpeg" \
     https://.../publico/tickets
```

→ `201 { data: { numero: "TK-0001" } }` — **solo el número**, nunca el id interno ni el `token_publico`.

Efectos en la misma transacción: se encolan dos correos en `correo_saliente` (outbox, los envía el worker, ver más abajo): `ticket_creado` al `correo` del solicitante, y `aviso_soporte` a `SOPORTE_EMAIL` (con `Auto-Submitted: auto-generated`, para no generar un bucle si algún día se lee ese buzón — Fase 6).

Errores: `400 VALIDATION_ERROR` (campo faltante/inválido, incluido `captchaToken` vacío); `415/413/400 ADJUNTO_*` (mismos códigos que `POST /adjuntos`); `429 RATE_LIMITED` (5/hora por IP).

### POST /publico/tickets/seguimiento — obtener un token de portal

Body `{ "numero": "TK-0001", "email": "juan@cliente.cl", "captchaToken": "..." }`. Busca el ticket por `numero` **y** que `solicitanteEmail` coincida (colación insensible a mayúsculas de la BD, sin `LOWER()`).

- Coincide → `200 { data: { token } }` (JWT de portal, `scope:"portal"`, 15 min).
- No coincide (número inexistente, **o** existente con otro correo) → **exactamente la misma respuesta** en ambos casos, con un retardo fijo de ~200 ms antes de responder: `401 { status:"error", code:"SEGUIMIENTO_INVALIDO", message:"No pudimos validar esos datos" }`. Nunca revela cuál de las dos causas fue.

Errores: `400 VALIDATION_ERROR`; `429 RATE_LIMITED` (10/hora por IP **y**, por separado, 20/día por el `email` del body — el diseño exige ambos, no solo IP).

### GET /publico/ticket — con token de portal

DTO reducido, construido campo a campo (`toPortalTicket`/`toPortalOt`, nunca spread de la entidad ni el DTO interno):

```json
{ "numero": "TK-0001", "asunto": "…", "descripcion": "…", "estado": "abierto",
  "fechaIngreso": "…",
  "mensajes": [{ "id": "…", "tipo": "cliente", "cuerpo": "…", "creadoEn": "…" }],
  "ot": { "estado": "en_ejecucion", "fechaEstimadaTermino": "2026-10-01", "responsableNombre": "…" } }
```

- `mensajes`: el hilo del ticket **excluyendo `nota_interna`** (filtro en el `WHERE`, no en memoria); incluye `tipo: "cliente"` (mensajes del propio solicitante) y `"respuesta_cliente"` (respuestas del staff), en orden cronológico.
- `ot`: `null` si el ticket no tiene ninguna OT vinculada; si tiene una o más, la de origen primero (o la más antigua si ninguna es de origen) — **nunca** horas, montos, cotizaciones ni otros datos internos.

### POST /publico/ticket/mensajes — responder como cliente

`multipart/form-data`: `cuerpo` (texto) + archivos opcionales en `adjuntos` (mismas reglas; quedan sueltos al ticket, `entidadTipo='ticket'`, sin re-parentarse a este mensaje). Crea un `mensaje_ticket` con `tipo:'cliente'`, `autorId: null`, `autorExterno` = el correo del ticket.

- Si el ticket estaba `esperando_cliente` o `resuelto`: se reabre a `abierto`; si estaba `esperando_cliente`, además cierra la pausa de SLA activa y corre los vencimientos por lo que duró.
- Si estaba `cerrado`: **no se reabre** (decisión del staff).

→ `201 { data: { id, cuerpo, creadoEn } }`. Errores: `400 VALIDATION_ERROR` (cuerpo vacío); `415/413/400 ADJUNTO_*`; `429 RATE_LIMITED` (30/hora por IP).

### POST /publico/adjuntos — adjuntar evidencia después

`multipart/form-data`, un solo archivo en el campo **`archivo`** (mismo campo que el endpoint interno). Sube al ticket del token (`entidadTipo='ticket'`), fuera del flujo de creación o de un mensaje puntual.

→ `201 { data: { id } }`. Errores: `415/413/400 ADJUNTO_*`; `429 RATE_LIMITED` (30/hora por IP).

### GET /publico/adjuntos/:id/descargar — con token de portal

Mismas cabeceras de seguridad que `GET /adjuntos/:id/descargar`. Solo descarga si el adjunto pertenece al ticket del token: directamente (`entidadTipo='ticket'`) o a través de un mensaje de **ese mismo ticket** cuyo `tipo` sea `'cliente'` o `'respuesta_cliente'` — **nunca** `'nota_interna'`, ni un adjunto de otro ticket u otra OT. Si no cumple: **404** (no 403, mismo principio de privacidad que las notificaciones de la Fase 4 — nunca revela que el recurso existe).

---

## Correo saliente (Fase 5)

Outbox transaccional (`correo_saliente`): se inserta en la MISMA transacción del hecho que lo origina, nunca se envía de forma síncrona en el request. Dos orígenes hoy:

1. `POST /publico/tickets` → `ticket_creado` (al solicitante) + `aviso_soporte` (a `SOPORTE_EMAIL`).
2. `POST /tickets/:id/mensajes` con `tipo:'respuesta_cliente'` (panel interno) → `respuesta_cliente` (al `solicitanteEmail` del ticket); el `Message-ID` generado se guarda también en `mensaje_ticket.messageId` de ese mensaje (para que la Fase 6 pueda enganchar `In-Reply-To`).

Cada correo lleva `Message-ID` propio (`<uuid@MAIL_DOMINIO>`), `X-SIGA-Ticket: <numero>` y `References` encadenado al `Message-ID` anterior del mismo ticket (si hubo alguno).

Un worker (`api/worker.ts`, cron cada 30 s) toma filas `pendiente` vencidas (`WITH (UPDLOCK, READPAST, ROWLOCK)`), llama al `Mailer` configurado (`MAIL_PROVIDER`: `consola` por defecto, registra en el log; o `smtp`, con `nodemailer`) y:

- Éxito → `estado='enviado'`.
- Falla → `intentos += 1`; si llega a 5, `estado='fallido'` + notificación in-app a todos los `admin`; si no, vuelve a `pendiente` con `proximoIntentoEn = ahora + 2^intentos minutos`.

---

## Ingesta de correo (Fase 6)

`MailboxSource` (`mail/ingest/`): IMAP genérico (decisión 0.1 del diseño), `NoopMailboxSource` si `IMAP_HOST` no está configurado (no falla al arrancar, solo no encuentra mensajes). `MAILBOX_PROVIDER=graph` está reservado en el tipo pero lanza un error claro al arrancar si se selecciona (no implementado, mismo patrón que `CAPTCHA_PROVIDER`).

Un worker (`api/worker.ts`, cron cada **2 minutos**, corre también una vez al arrancar) llama a `jobs/ingestaCorreoJob.ts::procesarIngesta()`, que:

1. Lee el cursor guardado para el origen (`mailbox_cursor`, PK = `MailboxSource.nombre()`; `null` la primera vez).
2. Pide los mensajes nuevos a la `MailboxSource` (`fetchNuevos(cursor)`, basado en UID de IMAP, no en fechas).
3. Procesa cada mensaje por separado (`services/correoIngerido.service.ts::procesarMensajeEntrante`), **cada uno en su propia transacción**: un mensaje que falla nunca tumba el resto del lote.
4. Al terminar de intentar TODOS los mensajes del lote (con éxito o en error), guarda el cursor nuevo devuelto por `fetchNuevos` (un único `MERGE` sobre `mailbox_cursor`). Criterio de consistencia: cada mensaje ya queda registrado de forma durable e idempotente en `correo_ingerido` (INSERT confirmado antes de tocar cualquier ticket) independientemente de si el resto del pipeline tuvo éxito o falló; si el proceso muere a mitad de un lote, el cursor guardado simplemente no avanza y la próxima pasada vuelve a pedir el mismo rango — la idempotencia de `message_id` (UNIQUE) descarta sin duplicar nada lo que ya se había registrado.

Pipeline por mensaje (orden fijo):

1. **Idempotencia**: el correo crudo (una serialización JSON de `CorreoEntrante`, adjuntos en base64) se guarda en `FileStorage` con clave = su propio sha256, usada como `raw_ref`; luego `INSERT correo_ingerido (message_id, ...)`. Si `message_id` ya existía (UNIQUE), el mensaje se descarta sin ningún otro efecto.
2. **Bucles** (`estado='ignorado'`, sin tocar ningún ticket): cabecera `Auto-Submitted` presente y distinta de `no`; `Precedence: bulk` o `auto_reply`; remitente = `SOPORTE_EMAIL`; `Content-Type: multipart/report`; remitente `mailer-daemon@...`.
3. **Threading**: `In-Reply-To`/`References` contra `mensaje_ticket.message_id` (coincidencia exacta) primero; si no hay match, `TK-\d{4}` en el asunto, validando que el remitente coincida con `ticket.solicitanteEmail` (si no coincide, se trata como ticket **nuevo**, nunca secuestra el ticket ajeno). Sin match de ninguna de las dos: ticket nuevo.
4. **Ticket existente**: nuevo `mensaje_ticket` (`tipo='cliente'`, `autorId=null`, `autorExterno`=remitente, `cuerpo`=texto plano, `cuerpoHtml`=HTML sanitizado con `sanitize-html` si vino, `messageId`/`inReplyTo`/`referencias` copiados). Si el ticket estaba `esperando_cliente` o `resuelto`: reabre a `abierto` y cierra la pausa de SLA activa (función compartida con el portal, `ticket.common.ts::reabrirTicketSiCorresponde`); `cerrado` no se reabre. Evento `mensaje_cliente {mensajeId}`.
5. **Ticket nuevo**: `canal='correo'`, `recepcionadoPor='sistema'`, `solicitanteNombre`/`solicitanteEmail` del remitente, `asunto` del correo, `descripcion`=texto plano (sin generar un primer `mensaje_ticket`, igual que el portal), folio `TK-xxxx`, prioridad `media` (el correo no trae una señal de prioridad, mismo default que el portal), SLA calculado igual que las demás rutas de creación, `fechaIngreso` = cuándo llegó el correo (no cuándo se procesó). Los adjuntos del correo **sí** se guardan en un ticket nuevo (decisión documentada, `entidadTipo='ticket'`), ya que no hay `mensaje_ticket` al cual colgarlos (el cuerpo va directo a `descripcion`).
6. **Adjuntos**: misma validación de MIME/extensión/tamaño que `POST /adjuntos`. Uno que no pasa la lista blanca se **descarta en silencio** (se deja constancia en el log, el resto del mensaje se procesa igual). Cuota excedida, fallo de antivirus o de almacenamiento **sí** propagan el error (todo el mensaje cae a `estado='error'`).
7. Sin error: `correo_ingerido.estado='procesado'`, `ticketId` = el ticket correspondiente. Con una excepción no esperada: `estado='error'`, `error`=el mensaje.

### GET /correos-ingeridos · admin

Query: `page` (≥1, def. 1), `perPage` (1–100, def. 25), `estado` (`pendiente|procesado|ignorado|error`, opcional).

```json
{ "status": "ok",
  "data": [{ "id": "…", "messageId": "<abc@cliente.cl>", "origen": "imap:INBOX", "recibidoEn": "…",
             "estado": "error", "ticketId": null, "error": "Se superaría el máximo de 25 MB de adjuntos" }],
  "meta": { "page": 1, "perPage": 25, "total": 1 } }
```

### POST /correos-ingeridos/:id/reprocesar · admin

Solo si `estado='error'` (`409 CORREO_INGERIDO_NO_REPROCESABLE` si no). Relee el `raw_ref` desde `FileStorage` (sin volver a conectarse al buzón), reconstruye el correo y corre el mismo pipeline sobre ese único mensaje, reutilizando la fila existente (nunca duplica una fila por el mismo `message_id`). → `200 { data: { id, messageId, origen, recibidoEn, estado, ticketId, error } }`, incluso si vuelve a fallar (queda en `error` de nuevo). `404 CORREO_INGERIDO_NO_ENCONTRADO` si el id no existe.

---

## Dashboard y búsqueda global (Fase 7)

Por consulta directa (sin materializar nada — con ~8 usuarios es apropiado), sin paginación ni caché. Ambos endpoints requieren rol mínimo `lectura`.

### GET /dashboard · lectura

Query opcional `desde`/`hasta` (`YYYY-MM-DD`). `hasta` anterior a `desde` → `400 VALIDATION_ERROR` (mismo estilo que el resto de los filtros de fecha de la API). Si solo viene uno de los dos, se aplica solo ese límite (no se inventa el otro lado del rango); sin ninguno de los dos, sin filtro de fecha (histórico completo).

Cada campo indica si es una **foto del estado actual** (no se mueve con `desde`/`hasta`) o si está **filtrado** por fecha (sobre la columna que se indica; en columnas `datetimeoffset` el día se cuenta en hora de Chile, igual que el resto de los filtros `desde`/`hasta` de la API — `AT TIME ZONE 'Pacific SA Standard Time'`; `cotizacion.fecha` ya es un `date` de negocio y no necesita esa conversión).

```
GET /api/v1/dashboard?desde=2026-09-01&hasta=2026-09-30
```
```json
{ "status": "ok", "data": {
  "otActivas": 12,
  "otConSlaVencido": 2,
  "montoCotizacionesAprobadas": 4500000,
  "tiempoMedioResolucionDias": 3.5,
  "otPorEstado": [
    { "estado": "ingresado", "cantidad": 4 }, { "estado": "en_cotizacion", "cantidad": 1 },
    { "estado": "aprobado", "cantidad": 2 }, { "estado": "en_ejecucion", "cantidad": 5 },
    { "estado": "terminado", "cantidad": 8 }, { "estado": "facturado", "cantidad": 3 } ],
  "otPorCliente": [ { "clienteId": "…", "clienteNombre": "Minera Los Andes", "cantidad": 4 } ],
  "otPorResponsable": [ { "usuarioId": "…", "usuarioNombre": "Juan Pérez", "cantidad": 5 } ],
  "cotizacionesPorEstado": [
    { "estado": "borrador", "cantidad": 1, "montoClp": 90000 },
    { "estado": "enviada", "cantidad": 0, "montoClp": 0 },
    { "estado": "aprobada", "cantidad": 3, "montoClp": 4500000 },
    { "estado": "rechazada", "cantidad": 1, "montoClp": 200000 } ],
  "ticketsSinResponderFueraDeSla": 2,
  "tiempoMedioPrimeraRespuestaHoras": 1.8
} }
```

| Campo | Foto actual / filtrado | Qué cuenta |
|---|---|---|
| `otActivas` | Foto actual | OT con `estado NOT IN ('terminado','facturado')` |
| `otConSlaVencido` | Foto actual | OT con `slaEstado='vencida'` y no terminal |
| `montoCotizacionesAprobadas` | Filtrado (`aprobadaEn`) | `SUM(montoClp)` de cotizaciones `estado='aprobada'` |
| `tiempoMedioResolucionDias` | Filtrado (`terminadoEn`) | Promedio de `(terminadoEn - fechaIngreso)` en días, de OT con `terminadoEn` no nulo. `null` si no hay datos |
| `otPorEstado` | Foto actual | Cantidad de OT por cada uno de los 6 estados, incluidos los que están en 0 |
| `otPorCliente` | Foto actual | Top 10 clientes por cantidad de OT activas (mismo criterio que `otActivas`); solo clientes con ≥ 1, sin las OT internas (sin cliente) |
| `otPorResponsable` | Foto actual | OT activas agrupadas por `responsableActualId` (sin límite; excluye las sin responsable) |
| `cotizacionesPorEstado` | Filtrado (`fecha`) | Cantidad y `SUM(montoClp)` por cada uno de los 4 estados, incluidos los que están en 0 |
| `ticketsSinResponderFueraDeSla` | Foto actual | Tickets con `primeraRespuestaEn IS NULL` y `slaEstado='vencida'` |
| `tiempoMedioPrimeraRespuestaHoras` | Filtrado (`primeraRespuestaEn`) | Promedio de `(primeraRespuestaEn - fechaIngreso)` en **horas de reloj** (no horas hábiles: es una métrica de reporte, distinta del cálculo de cumplimiento de SLA de la Fase 4, que sí cuenta en horas hábiles). `null` si no hay datos |

### GET /buscar · lectura

Query `q` (1–100 caracteres, mismo estilo Zod que los demás filtros `q`). Cuatro ramas, cada una como una consulta `TOP 5` separada (no un único `UNION ALL`: cada tipo devuelve una forma distinta, así que combinar 4 queries en la aplicación evita rellenar columnas con `NULL` a mano y es igual de simple de mantener), usando `escaparLike` (la misma función que ya usan los filtros `q` de OT/tickets/cotizaciones) para que `%`, `_` y `[` se busquen literales. Sin paginación (autocompletar, no un listado).

```
GET /api/v1/buscar?q=OT-1042
```
```json
{ "status": "ok", "data": {
  "ots": [ { "tipo": "ot", "id": "…", "numero": "OT-1042", "titulo": "…", "estado": "en_ejecucion" } ],
  "tickets": [ { "tipo": "ticket", "id": "…", "numero": "TK-0001", "asunto": "…", "estado": "abierto" } ],
  "cotizaciones": [ { "tipo": "cotizacion", "id": "…", "numero": "COT-2041", "estado": "aprobada", "montoClp": 150000 } ],
  "clientes": [ { "tipo": "cliente", "id": "…", "nombre": "Minera Los Andes" } ]
} }
```

- **OT**: por `numero` o `titulo`.
- **Ticket**: por `numero` o `asunto`.
- **Cotización**: por `numero`.
- **Cliente**: por `nombre`.

Cada arreglo trae como máximo 5 resultados, más recientes primero (por `numero DESC`; los clientes, que no tienen folio, por `nombre ASC`).
