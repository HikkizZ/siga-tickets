# siga-ot — Contrato de la API (Fases 0 y 1)

Documento vivo: lista **todos los endpoints implementados**. La fuente de verdad del diseño es `backend-diseno.md`; si algo difiere, este archivo describe lo que el código hace hoy. Estado: Fase 0 (auth, usuarios, clientes) y Fase 1 (OT núcleo, adjuntos) implementadas.

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
| 404 | `OT_NO_ENCONTRADA`, `NOT_FOUND` | Recurso inexistente |
| 409 | `CONFLICTO_CONCURRENCIA` | Otra operación ganó una carrera (derivación simultánea); reintenta |
| 500 | `INTERNAL_ERROR` | Error no controlado (nunca trae detalle) |

### Permisos por fila (OT)

`admin`/`gestion`: sin restricción. `tecnico`:

| Acción | Condición |
|---|---|
| Editar, cambiar estado, comentar, adjuntar | responsable actual **o** colaborador |
| Derivar | solo el responsable actual |
| Etapas; añadir/quitar colaboradores | solo el responsable actual (además, cualquier `tecnico` puede añadirse a sí mismo como colaborador) |
| Horas | registrar: solo las propias y solo si eres responsable o colaborador de la OT; borrar: solo las propias (sin exigir relación con la OT) |

`lectura` solo lee y descarga.

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
  "cotizaciones": [], "tickets": [] }
```
- `cadenaResponsables`: orden cronológico; el tramo abierto lleva `actual: true`, `hasta: null` y `duracionSeg` = lo transcurrido hasta ahora; el primero tiene `motivoEntrada` y `derivadoPor` en `null`.
- `eventos`: más recientes primero (timeline). `cotizaciones` y `tickets` se llenarán en las fases 2 y 3.
- `slaEstado`/`slaResolucionVenceEn`: la Fase 1 no los calcula (llegan en la Fase 4).

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

---

## Adjuntos

### POST /adjuntos · tecnico (responsable o colaborador de la OT; gestion/admin siempre)

`multipart/form-data` con los campos `entidadTipo=ot` (por ahora solo `ot`), `entidadId=<uuid de la OT>` y el archivo en el campo **`archivo`** (un solo archivo).

```
curl -H "Authorization: Bearer $TOKEN" -F entidadTipo=ot -F entidadId=$OT_ID -F "archivo=@informe.pdf;type=application/pdf" $BASE/api/v1/adjuntos
```
→ `201 { data: { id, nombre, mime, tamanoBytes, estado, subidoPor, creadoEn } }`.

- Lista blanca de **extensión y MIME** (deben corresponderse): pdf, png, jpg/jpeg, gif, webp, doc, docx, xls, xlsx, ppt, pptx, txt, csv, zip. Otro tipo → `415 ADJUNTO_TIPO_NO_PERMITIDO`.
- Máx. 10 MB por archivo (`413 ADJUNTO_MUY_GRANDE`) y 25 MB por OT (`413 ADJUNTO_CUOTA_EXCEDIDA`). Archivo vacío o multipart mal formado → `400 ADJUNTO_INVALIDO`; OT inexistente → `404 OT_NO_ENCONTRADA`.
- El nombre original se sanea (sin rutas) y solo se guarda para mostrarlo; en disco el archivo se llama como su sha256. `estado` queda `limpio` sin escaneo real (ver diseño: antivirus pendiente).

### GET /adjuntos/:id/descargar · lectura

Stream autenticado (el frontend debe pedirlo con el token, p. ej. `fetch` + `blob`, no con un `<a href>` sin cabecera). Respuesta con `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox`, `Cache-Control: private, no-store`. Errores: `404 ADJUNTO_NO_ENCONTRADO`, `409 ADJUNTO_NO_DISPONIBLE` (estado distinto de `limpio`).

---

## Eventos de auditoría (`eventos[].tipo` en el detalle de OT)

`creado`, `estado_cambiado {de,a}`, `prioridad_cambiada {de,a}`, `derivado {de,a,motivo,mantuvoComoColaborador}`, `comentario {comentarioId,visibleCliente}`, `horas_registradas {horaId,usuarioId,fecha,horas}`, `horas_eliminadas {horaId,usuarioId,horas}`, `colaborador_agregado|colaborador_quitado {usuarioId}`, `etapa_creada|etapa_eliminada {etapaId}`, `etapa_editada {etapaId,campos}`, `adjunto_agregado {adjuntoId,mime,tamanoBytes}`, `ot_editada {campos}`. Los payloads guardan ids, no copias de datos personales.

## Otros

- `GET /health` (sin JWT) → `{ status: "ok", data: { db: "ok" } }`; `503 DB_UNAVAILABLE` si la base no responde.
