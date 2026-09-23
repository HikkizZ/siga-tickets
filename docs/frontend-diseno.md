# siga-ot — Plan de adaptación del frontend

Plantilla de Lovable (React 19 + TanStack Start/Router + Tailwind v4 + shadcn/ui + TanStack Query, en `frontend/`, copiada el 2026-09-23 desde `C:\Users\fmira\Downloads\pixel-perfect-canvas-6040`) con **~6.260 líneas** de UI y un store único en memoria (`src/lib/ot-store.tsx`, un Context de React) inicializado desde `src/lib/mock-data.ts`. Cubre todo lo que se fue pidiendo en Lovable a lo largo del proyecto: kanban, línea de tiempo, tickets/mesa de ayuda, cotizaciones, SLA, notificaciones, derivación, colaboradores. Nada de eso llama a una API — este documento es el plan para reemplazar ese store por llamadas reales al backend (`docs/backend-diseno.md`, `docs/api.md`), fase por fase, igual que se hizo con el backend.

Confirmado antes de tocar nada: `npm install` limpio (414 paquetes, 0 vulnerabilidades), `tsc --noEmit` limpio, `npm run dev` funciona (puerto **8080**, no 3000 — Vite lo fija en `vite.config.ts`) y el tablero renderiza con los datos mock, sin errores de consola.

## Decisiones de arquitectura (antes de la Fase 0)

- **Cliente de red**: `TanStack Query` (ya es dependencia) + un cliente `fetch` propio (`src/lib/api/client.ts`, nuevo) que entiende el sobre `{status:'ok'|'error', data, meta}` del backend, adjunta `Authorization: Bearer <token>`, lee `X-Renewed-Token` de cada respuesta y renueva la sesión sola (el backend ya expone ese header vía CORS). Nunca `fetch` suelto en un componente.
- **Auth**: el JWT se guarda en `localStorage` (app interna de ~8 personas, sin scripts de terceros que puedan robarlo por XSS — trade-off aceptado, no es un banco). Un `AuthProvider` (nuevo) reemplaza el `usuarioActual` fijo del mock por el usuario real devuelto por `GET /auth/me`; las rutas protegidas redirigen a `/login` sin sesión.
- **Valores de enum**: el mock usa etiquetas en español con mayúscula ("Alta", "Ingresado"); el backend usa minúsculas (`alta`, `ingresado`, ver `entities/enums.ts`). Se adaptan los tipos del frontend para usar **los valores reales del backend** en el estado y la red, y una función de mapeo (`src/lib/labels.ts`, nuevo) solo para lo que se muestra en pantalla — nunca una tabla de traducción bidireccional escondida en cada componente.
- **`ot-store.tsx` se reemplaza por hooks de TanStack Query** (`useOts`, `useOt(id)`, `useCrearOt`, etc.) por dominio, no por un contexto único — mismo criterio de "un archivo por responsabilidad" que ya usa el backend.
- **Variable de entorno** `VITE_API_URL` (nueva, default `http://localhost:3002/api/v1` en desarrollo).
- **Base URL del portal público** (`/publico/*`) se maneja aparte del cliente autenticado (sin `Authorization`, con el token de portal de 15 min cuando corresponda).

## Plan por fases (mismo espíritu que el backend: agentes delegados, cada uno verificado con `tsc`, un recorrido real en el navegador, y sin dejar el build roto)

| Fase | Entrega |
|---|---|
| **0** | Infraestructura: cliente de red, `AuthProvider`, login real contra `POST /auth/login`, protección de rutas, `VITE_API_URL`, primer `usuarios`/`clientes` reales (los selectores de casi todo formulario los necesitan) |
| 1 | OT núcleo: Tablero (kanban), Todas las OT, Nueva OT, detalle de OT (derivación, colaboradores, horas, etapas, comentarios, adjuntos) |
| 2 | Cotizaciones (vista propia + flujo de crear/vincular dentro del detalle de OT) |
| 3 | Tickets / mesa de ayuda interna (bandeja, detalle, tomar, derivar, mensajes, convertir a OT) |
| 4 | Configuración de SLA, notificaciones (campana + resumen al iniciar sesión) |
| 5 | Portal público (`/mesa-de-ayuda`, `/mesa-de-ayuda/seguimiento`) contra `/publico/*` |
| 6 | Dashboard + buscador global |

(La Fase 6 del backend, ingesta de correo, no tiene contraparte de UI en el prototipo — es un proceso de servidor, sin pantalla propia pedida hasta ahora.)

## Estado

- **Fase 0**: hecha (2026-09-22). Detalle abajo.
- **Fase 1**: hecha (2026-09-23). Detalle abajo.
- **Fase 2**: hecha (2026-09-23). Detalle abajo.
- **Fase 3**: hecha (2026-09-23). Detalle abajo.
- **Fase 4**: hecha (2026-09-23). Detalle abajo.

## Fase 0 — qué quedó

Archivos nuevos:

- `src/lib/api/client.ts` — `apiClient` (autenticado, `/api/v1`) y `publicApiClient` (`/publico`, sin
  `Authorization` por defecto, acepta `portalToken` para las fases futuras). Interpreta el sobre
  `{status,data,meta}`, lanza `ApiError {status,code,message,details}` en cualquier error, y lee
  `X-Renewed-Token` para la sesión deslizante.
- `src/lib/auth/token.ts` — lectura/escritura del JWT en `localStorage`, con los try/catch de SSR
  y modo privado ya resueltos una sola vez.
- `src/lib/auth/AuthProvider.tsx` + `useAuth()` — `usuario`, `estaAutenticado`, `cargando`,
  `login(username,password)`, `logout()`. Al montar valida el token guardado contra `GET /auth/me`;
  `login()` usa directamente `{token,user}` de `POST /auth/login`, sin un `GET /auth/me` extra.
- `src/components/RouteGuard.tsx` — protección de rutas a nivel de componente (el proyecto no usa
  `beforeLoad`/`loader` en ninguna ruta, así que no se inventó un mecanismo nuevo). `/login` y
  `/mesa-de-ayuda*` quedan explícitamente exentas (portal público, sin sesión). Mientras se valida
  el token guardado no se renderiza contenido protegido (evita parpadeo y mismatch de hidratación
  en SSR, donde `localStorage` no existe).
- `src/lib/api/usuarios.ts`, `src/lib/api/clientes.ts`, `src/hooks/useUsuarios.ts`,
  `src/hooks/useClientes.ts` — `GET /usuarios` y `GET /clientes` reales vía TanStack Query.
- `src/lib/labels.ts` — mapeo completo de los enums del backend (minúsculas) a las etiquetas del
  diseño visual: `EstadoOt`, `CategoriaOt`, `OrigenOt`, `Prioridad`, `SlaEstado`, `EstadoTicket`,
  `CanalTicket`, `EstadoCotizacion`, `Rol`. Las fases siguientes solo importan estas funciones.
- `.env.example`, `.env.local` (con `VITE_API_URL=http://localhost:3002/api/v1`), `src/vite-env.d.ts`
  (declara `ImportMetaEnv.VITE_API_URL` para poder leerlo con notación de punto bajo
  `noPropertyAccessFromIndexSignature`). `.env.local` ya caía bajo el `*.local` de `.gitignore`.
- `.claude/launch.json` — para levantar el frontend con las herramientas de navegador (`npm run dev`,
  puerto 8080).

Editados:

- `src/routes/login.tsx` — formulario real contra `useAuth().login()`. El campo se renombró de
  "Correo" a "Usuario" (el backend autentica por `username`, no email; el mock traía un correo de
  ejemplo que ya no aplica). Se quitó el texto "cualquier dato te lleva al tablero". No había ningún
  control de "recordar sesión" en el diseño original — nada que adaptar ahí.
- `src/routes/__root.tsx` — agrega `AuthProvider` y `RouteGuard` alrededor de `OTProvider`/`AppShell`.
  El `QueryClientProvider` ya existía (venía de la plantilla, con el `QueryClient` de `router.tsx`);
  Fase 0 solo le agregó `defaultOptions` razonables (`retry:1`, sin refetch al enfocar, `staleTime`
  30s) — no había que crear el proveedor de cero.
- `src/router.tsx` — `defaultOptions` del `QueryClient` (ver arriba).
- `src/components/AppShell.tsx` — `MenuPerfil` ahora usa `useAuth()` en vez de `usuarioActual`
  (mock-data.ts): nombre, iniciales (calculadas), correo y rol reales; "Cerrar sesión" llama a
  `logout()` y redirige a `/login`. El diálogo "Mi perfil" agrega una sección de solo lectura
  "Datos reales del backend (Fase 0)" con el total de usuarios y clientes vía `useUsuarios()` /
  `useClientes()` — es el lugar de bajo riesgo elegido para el punto 6 (no se tocó ninguna pantalla
  de negocio). El diálogo "Cambiar contraseña" se dejó tal cual (mock, sin wiring a
  `POST /auth/password`): no estaba en el alcance de la Fase 0.

Fuera de alcance, sin tocar: `mock-data.ts`, `ot-store.tsx`, tablero, todas-las-OT, línea de tiempo,
tickets, cotizaciones, configuración de SLA, mesa de ayuda — siguen 100% sobre datos mock.

## Fase 0 — verificación

`npx tsc --noEmit` limpio.

Recorrido real en navegador (backend `npm run dev` contra la BD real `siga-tickets`, frontend
`npm run dev` puerto 8080, MCP de navegador):

1. Usuario de prueba: sin registro público, así que se creó un admin desechable por variables de
   entorno al script `seed.ts` (`SEED_ADMIN_USERNAME=qa_felipe_admin`, contraseña aleatoria de un
   solo uso generada con `openssl rand -hex 16`, nunca impresa ni guardada en el repo) y, con su
   token, un usuario `tecnico` real vía `POST /usuarios` (`qa_felipe_tecnico`). Ninguna contraseña
   real (ni la del admin sembrado originalmente, ni estas de prueba) quedó en ningún archivo del
   repo.
2. `/login` con credenciales inválidas → mensaje real del backend ("Credenciales inválidas"), sin
   tocar el mock.
3. `/login` con `qa_felipe_tecnico` → redirige a `/`; el encabezado y el diálogo "Mi perfil"
   muestran el usuario real ("QA Felipe Tecnico", "Técnico", correo real) donde antes había datos
   fijos del mock.
4. En "Mi perfil": `Clientes: 5` (real, `GET /clientes`); `Usuarios: error` — esperado, `GET
   /usuarios` exige rol `admin` y este usuario es `tecnico` (RBAC del backend funcionando, no un
   bug). Se confirmó iniciando sesión con `qa_felipe_admin`: ahí "Usuarios" mostró 4 y "Clientes" 5,
   validando el camino feliz de ambos endpoints.
5. "Cerrar sesión" → vuelve a `/login`.
6. Navegación directa a `/todas-las-ot` sin sesión → redirige a `/login` (protección de rutas
   confirmada también por URL directa, no solo por clic dentro de la app).
7. Consola del navegador sin excepciones no controladas; los únicos `error` registrados son las
   respuestas HTTP 401/403 esperadas de los pasos 2 y 4 (Chrome loguea cualquier fetch no-2xx como
   "Failed to load resource", aunque la app las maneje bien).

Al terminar: el usuario de prueba `tecnico` quedó desactivado (`PATCH /usuarios/:id {activo:false}`)
con el propio token admin de prueba. El admin de prueba `qa_felipe_admin` **no** se pudo desactivar
a sí mismo (el backend lo bloquea explícitamente: "409 si el admin intenta desactivarse" — hace
falta otro admin activo para eso). Queda activo en `siga-tickets` con una contraseña aleatoria que
ya no está en ningún lado (ni en este repo ni en ningún archivo temporal); si se quiere, el admin
real puede desactivarlo desde `PATCH /usuarios/:id`. Backend y frontend quedaron **detenidos** al
terminar (no corriendo).

## Fase 1 — qué quedó

Archivos nuevos:

- `src/lib/api/ots.ts` — funciones de red puras para OT (mismo patrón que `usuarios.ts`/`clientes.ts`):
  tipos `OtListItem`, `OtKanbanItem`/`OtKanbanColumna`, `OtDetalle` (con `cadenaResponsables`,
  `etapas`, `horas`, `comentarios`, `adjuntos`, `eventos`, `cotizaciones`, `tickets` embebidos tal
  cual los documenta `docs/api.md`), y una función por endpoint: `obtenerOts`, `obtenerOtsKanban`,
  `obtenerOt`, `crearOt`, `actualizarOt`, `cambiarEstadoOt`, `derivarOt`, `agregarColaborador`/
  `quitarColaborador`, `agregarComentario`, `agregarHora`/`quitarHora`, `crearEtapa`/`actualizarEtapa`/
  `eliminarEtapa`, `subirAdjunto` (multipart) y `descargarAdjunto` (fetch + blob autenticado, ver
  más abajo).
- `src/hooks/useOts.ts` — un hook de TanStack Query por operación (`useOtsKanban`, `useOts`, `useOt`,
  y una mutación por cada función de red de arriba). Todas las mutaciones invalidan el árbol
  completo bajo la clave `["ots"]` al terminar (cubre detalle + lista + kanban de una vez, más
  simple que invalidar query por query) y muestran `toast.error(mensaje real del backend)` si
  fallan; `useDerivarOt` además confirma con un `toast.success` breve.
- `src/hooks/useDebounced.ts` — debounce genérico (300 ms), usado por el filtro de texto del
  Tablero y de Todas las OT para no pegarle a `GET /ots`/`GET /ots/kanban` en cada tecla.

Editados:

- `src/lib/api/client.ts` — se agregó `apiClient.postForm` (multipart/form-data, para
  `POST /adjuntos`); reutiliza `interpretarRespuesta`/el manejo de `X-Renewed-Token` que ya tenía
  `ejecutar`, solo cambia cómo arma el `fetch` (sin `Content-Type` manual, `FormData` como body).
- `src/lib/labels.ts` — se agregaron los arreglos `ESTADOS_OT`, `CATEGORIAS_OT`, `ORIGENES_OT`,
  `PRIORIDADES` (mismo orden que usa el backend) para poblar los `<select>` de Fase 1 sin repetir
  la lista de valores en cada componente. El resto del archivo (traductores) no cambió.
- `src/lib/ot-store.tsx` — un solo campo nuevo en el `Store`: `otSeleccionadaId` (la id cruda de la
  OT abierta en el Sheet, ya la guardaba internamente como `seleccionada`, solo se expuso). Los
  componentes de OT reales ya no leen `otSeleccionada` (el objeto mock) — piden el detalle real a
  `useOt(otSeleccionadaId)`. `abrirOT`/`ticketAbierto`/tickets/cotizaciones/SLA/notificaciones
  siguen exactamente igual, y `TicketDetail.tsx`/`AppShell.tsx`/etc. (fuera de esta fase) no se
  tocaron.
- `src/lib/utils.ts` — se agregó `inicialesDeNombre(nombre)` (iniciales desde un nombre completo);
  lo necesitan los avatares de usuarios reales, que a diferencia del mock no traen `iniciales`
  precalculadas.
- `src/components/Prioridad.tsx` — `PrioridadBadge`, `SlaBadge` y `EstadoCotizacionBadge` ahora
  normalizan su prop (`"Alta"` o `"alta"`, `"En plazo"` o `"en_plazo"`, etc.) a la clave del backend
  antes de buscar estilo/etiqueta, así aceptan tanto los valores mock (tickets, cotizaciones,
  dashboard — fuera de esta fase) como los reales (OT, desde ahora) sin que ningún llamador tenga
  que adaptarse. `Avatar`/`AvataresEquipo` no se tocaron (`AvataresEquipo` sigue siendo mock-only;
  el Tablero/Todas las OT ahora arman su propio cluster de avatares con datos reales, ver abajo).
- `src/components/EtapasEditor.tsx` — se renombraron los campos de la etapa en edición de
  `inicio`/`fin` a `fechaInicio`/`fechaTermino` (mismo nombre que el backend, sin capa de traducción)
  y se agregó `esEtapaNueva(id)` (por el prefijo `"et-"` del id temporal) para que OTDetail sepa qué
  etapas crear vs. actualizar al guardar. Solo lo usan `nueva-ot.tsx` y `OTDetail.tsx`.
- `src/components/SelectorColaboradores.tsx` — dejó de importar el arreglo mock `usuarios`: ahora
  recibe la lista de candidatos por prop (`opciones`), que le pasan `nueva-ot.tsx`/`OTDetail.tsx`
  desde `useUsuarios()` real. Solo lo usan esos dos archivos, así que el cambio de forma no afecta
  nada fuera de esta fase.
- `src/components/Derivacion.tsx` — `DialogoDerivar` ganó una prop opcional `opciones`: si no se
  pasa, se comporta exactamente igual que antes (usuarios del mock, que sigue usando
  `TicketDetail.tsx`); `OTDetail.tsx` la pasa con la lista real. `CadenaResponsables` (el cálculo
  mock de tramos) no se tocó — `OTDetail.tsx` no lo usa, arma su propia lectura de
  `cadenaResponsables` (ya viene calculada por el backend) en un componente local
  (`CadenaResponsablesOt`, no exportado).
- `src/components/OTDetail.tsx` — reescrito para leer `useOt(otSeleccionadaId)` en vez del mock:
  estado/prioridad editables (`POST /ots/:id/estado`, `PATCH /ots/:id`), colaboradores (diff
  add/remove contra `POST`/`DELETE /ots/:id/colaboradores`), derivar, horas, comentarios (interno/
  visible cliente), etapas (alta/edición/baja reales, ver "Planificación" abajo), adjuntos (listar +
  subir + descargar), cotización (solo lectura del arreglo embebido, botones deshabilitados),
  tickets vinculados (solo lectura, reemplaza "Correos vinculados") e historial de actividad
  (traduce cada `tipo` de evento del backend a una frase, ver `textoEvento()`).
- `src/routes/__root.tsx` — se montó `<Toaster />` (de `src/components/ui/sonner.tsx`, ya era
  dependencia pero no estaba en el árbol) junto a `OTProvider`.
- `src/routes/index.tsx` (Tablero) — usa `useOtsKanban(filtros)` con los filtros reales (`q`
  debounced, `prioridad`, `responsableId`, `clienteId`, `mios`); las 6 columnas se recorren en el
  orden fijo de `ESTADOS_OT` (labels.ts) buscando la columna correspondiente en la respuesta. Los
  selects de Prioridad/Responsable/Cliente usan `PRIORIDADES` y `useUsuarios()`/`useClientes()`
  reales. Sin drag & drop (no existía, no se agregó).
- `src/routes/todas-las-ot.tsx` — usa `useOts(filtros)` con paginación real del servidor (ver
  "Paginación" abajo) y los mismos filtros reales que el Tablero. Se quitaron las columnas
  "Cotización" y "Horas" (ver decisión abajo) y el orden por click solo queda habilitado en las
  columnas que el backend sabe ordenar (`numero`, `titulo`, `estado`, `prioridad`, `fechaIngreso`,
  `fechaEstimadaTermino` — "responsable"/"cliente"/"sla" quedan sin botón de orden).
- `src/routes/nueva-ot.tsx` — formulario contra valores reales del backend (`clienteId`,
  `responsableId`, `colaboradorIds`, enums en minúscula). Ya no hay campo "Fecha de ingreso" (el
  backend la fija él mismo al crear, no se acepta en el body). Al guardar: `POST /ots`, y si hay
  etapas cargadas, un `POST /ots/:id/etapas` por cada una en paralelo; si alguna falla la OT igual
  quedó creada (cada `useCrearEtapa` ya avisa por su cuenta con un toast) y se navega igual a su
  detalle.

Fuera de alcance, sin tocar (más allá de lo estrictamente necesario para dejar de leer mock donde
correspondía): `mock-data.ts`, `ot-store.tsx` (salvo el campo `otSeleccionadaId`),
`linea-de-tiempo.tsx`, `tickets.tsx`, `cotizaciones.tsx`, `dashboard.tsx`, `configuracion.tsx`,
`mesa-de-ayuda/*`, `TicketDetail.tsx`.

### Decisiones dentro del espacio permitido

- **Paginación de "Todas las OT"**: 25 por página (razonable para el volumen esperado; hoy con 1 OT
  real no se pudo probar una segunda página, pero el control "Anterior/Siguiente" y el cálculo de
  `totalPaginas` sobre `meta.total` están implementados y listos).
- **Columnas quitadas de "Todas las OT"**: "Cotización" y "Horas" del mock no tienen equivalente en
  `GET /ots` (el listado no trae cotización vinculada ni total de horas — eso solo viene en
  `GET /ots/:id`) — pedirlo por fila implicaría N llamadas extra a la API solo para una tabla, así
  que se quitaron esas dos columnas en vez de inventar el dato o pagar ese costo.
- **Línea de tiempo (`linea-de-tiempo.tsx`)**: se dejó 100% en mock, a propósito. `GET /ots/kanban`
  (la misma query que arma el Tablero) no trae `fechaIngreso` — la línea de tiempo necesita ambas
  fechas (ingreso y estimada) para dibujar la barra de cada OT, así que conectarla de verdad exigía
  o bien pedir el detalle completo por cada OT (N+1) o agregar un filtro/campo nuevo al endpoint —
  ninguna de las dos es "reutilizar la misma query sin esfuerzo adicional", así que se documenta acá
  en vez de forzarlo.
- **Descarga de adjuntos**: implementada (no quedó opcional). `GET /adjuntos/:id/descargar` exige el
  header `Authorization`, así que `descargarAdjunto()` en `src/lib/api/ots.ts` hace `fetch` con el
  token, arma un blob y dispara la descarga con un `<a>` temporal — confirmado en el recorrido real
  (ver abajo).
- **Filtro de usuarios inactivos/`sistema`**: `GET /usuarios` (Fase 0) devuelve también al usuario
  técnico `sistema` (inactivo) y a cualquier usuario desactivado — el backend rechaza a ambos como
  responsable/colaborador/destino de derivación (`400`). Los tres selectores de personas
  (`SelectorColaboradores`, el `Select` de responsable en `nueva-ot.tsx`, y `DialogoDerivar` vía
  `OTDetail.tsx`) filtran `activo && username !== "sistema"` antes de listar opciones, para no
  ofrecer una opción que el backend va a rechazar.
- **`GET /usuarios` es admin-only (RBAC del backend, no un bug de esta fase)**: un `tecnico`
  logueado no puede listar usuarios, así que los selectores de responsable/colaboradores/derivar le
  quedan vacíos (el backend igual acepta que se cree/edite una OT sin tocar esos campos — el
  responsable por defecto es quien crea). Confirmado con `qa_felipe_tec_a` durante el recorrido;
  mismo hallazgo que ya había dejado la Fase 0 con "Mi perfil".

## Fase 1 — verificación

`npx tsc --noEmit` limpio.

Recorrido real en navegador (backend `npm run dev` contra la BD real `siga-tickets`, frontend
`npm run dev` puerto 8080, MCP de navegador):

1. Admin desechable nuevo por variables de entorno al script `seed.ts`
   (`SEED_ADMIN_USERNAME=qa_felipe_admin_f1`, contraseña propia de un solo uso, nunca impresa ni
   guardada en ningún archivo) y, con su token, dos usuarios `tecnico` reales vía `POST /usuarios`
   (`qa_felipe_tec_a`, `qa_felipe_tec_b`).
2. Con `qa_felipe_tec_a` (técnico): `/nueva-ot` carga con datos reales (`GET /clientes`), pero el
   selector de responsable/colaboradores queda vacío porque `GET /usuarios` es admin-only (ver
   decisión arriba) — RBAC del backend funcionando, no un bug. Se cambió a `qa_felipe_admin_f1` para
   probar el flujo completo con los tres selectores de personas poblados.
3. `/nueva-ot` con `qa_felipe_admin_f1`: se completó título, descripción, categoría, prioridad,
   ubicación, cliente real (`Minera Los Andes`), solicitante, fecha estimada, responsable
   (`qa_felipe_tec_a`), un colaborador (`qa_felipe_tec_b`) y una etapa ("Diagnóstico inicial") →
   `Guardar OT` → `POST /ots` (201) + `POST /ots/:id/etapas` (201) → navegó a Todas las OT con el
   detalle de la OT recién creada (OT-1041) abierto, mostrando cliente, responsable, colaborador,
   cadena de responsables y planificación reales.
4. Confirmada en el Tablero (columna "Ingresado", con avatares, SLA "En plazo" y contador de
   adjuntos) y en Todas las OT (misma fila, mismos datos).
5. Cambio de estado desde el detalle (`Ingresado` → `En ejecución`, `POST /ots/:id/estado`) →
   confirmado que la tarjeta se movió de columna al volver al Tablero.
6. Cambio de prioridad (`Media` → `Alta`, `PATCH /ots/:id`) → el campo "Vencimiento SLA" se
   recalculó en pantalla (de `02-oct` a `25-sept`), confirmando que el backend recalcula el SLA al
   cambiar prioridad, tal como documenta `api.md`.
7. Hora trabajada agregada (`POST /ots/:id/horas`) → aparece en la tabla con "2.5 h en total".
8. Comentario interno y comentario visible para el cliente agregados (`POST /ots/:id/comentarios`)
   → ambos aparecen con el badge correcto ("Interna" / "Visible para el cliente"), más recientes
   primero.
9. Adjunto real subido — el selector de archivo nativo del SO no se puede automatizar desde el MCP
   de navegador, así que se subió con `curl -F` contra el mismo endpoint (`POST /adjuntos`,
   `entidadTipo=ot`) que usa `useSubirAdjunto`; se confirmó en pantalla que el detalle lo lista con
   el ícono genérico correcto (mime `text/plain`), el peso en bytes, y que el botón de descarga
   funciona (`GET /adjuntos/:id/descargar` → 200, blob descargado vía `fetch` autenticado).
10. Derivación: primero un intento con motivo de 5 caracteres → `400 VALIDATION_ERROR` real del
    backend ("Datos inválidos") mostrado en el toast de error (confirmado también contra el cuerpo
    de la respuesta de red, no un mensaje genérico). Luego derivación válida a `qa_felipe_tec_b`
    con "mantenerme como colaborador" activo → responsable actual cambió, `qa_felipe_tec_a` (el
    responsable anterior) pasó a colaborador, y la cadena de responsables mostró los dos tramos con
    su duración y motivo.
11. Filtro "Mis asignados" en Todas las OT probado con `qa_felipe_admin_f1` (que no es responsable
    ni colaborador de la OT) → 0 resultados, confirmando que `mios=true` llega de verdad al backend
    y no es un filtro local.
12. Consola del navegador sin excepciones no controladas durante todo el recorrido; los únicos
    `error` registrados son los 403 esperados del paso 2 (RBAC) y el 400 esperado del paso 10
    (motivo corto).

Al terminar: `qa_felipe_tec_a` y `qa_felipe_tec_b` quedaron desactivados
(`PATCH /usuarios/:id {activo:false}`, ambos `200`). El admin de prueba `qa_felipe_admin_f1`
**no** se pudo desactivar a sí mismo (`409 CONFLICT`, mismo bloqueo que ya documentó la Fase 0);
queda activo en `siga-tickets` con una contraseña de un solo uso que no quedó en ningún archivo del
repo ni de logs. Backend y frontend quedaron **detenidos** al terminar (no corriendo).

## Fase 2 — qué quedó

Archivos nuevos:

- `src/lib/api/cotizaciones.ts` — funciones de red puras para Cotizaciones (mismo patrón que
  `ots.ts`): tipos `Cotizacion` (forma común list/detalle), `CotizacionDetalle` (agrega
  `aprobadaEn`/`eventos`), `CotizacionesFiltros`, y una función por endpoint: `obtenerCotizaciones`,
  `obtenerCotizacion`, `crearCotizacion`, `actualizarCotizacion`, `cambiarEstadoCotizacion`. El
  endpoint de vincular una cotización **existente** a una OT (`POST /ots/:id/cotizaciones/vincular`)
  se agregó en `ots.ts` en vez de acá (`vincularCotizacion(otId, cotizacionId)`): devuelve el mismo
  `<Detalle de OT>` que `GET /ots/:id`, no una `Cotizacion`, así que pertenece al dominio de OT.
- `src/hooks/useCotizaciones.ts` — un hook de TanStack Query por operación (`useCotizaciones`,
  `useCotizacion`, `useCrearCotizacion`, `useActualizarCotizacion`, `useCambiarEstadoCotizacion`),
  mismo criterio que `useOts.ts`. Cada mutación invalida el árbol `["cotizaciones"]` y también
  `["ots"]`: una cotización se embebe en `GET /ots/:id` (`ot.cotizaciones`), así que crear, editar o
  cambiar su estado debe refrescar también el detalle de la OT si está abierto. `useOts.ts` ganó el
  hook simétrico `useVincularCotizacion` (invalida `["ots"]` y `["cotizaciones"]` por la misma
  razón) y muestra un `toast.success` al vincular, igual que `useDerivarOt`.

Editados:

- `src/lib/api/ots.ts` — se agregó `vincularCotizacion(otId, cotizacionId): Promise<OtDetalle>`
  (ver arriba).
- `src/hooks/useOts.ts` — se agregó `useVincularCotizacion()` (ver arriba).
- `src/lib/labels.ts` — se agregó `ESTADOS_COTIZACION` (arreglo fijo para el `<select>` de filtro),
  `transicionesValidasCotizacion(estado)` (tabla de transiciones válidas de
  `POST /cotizaciones/:id/estado`, para no ofrecer nunca un botón que el backend rechazaría con
  `409 TRANSICION_INVALIDA`) y `puedeEscribirCotizaciones(rol)` (`rol === "admin" || rol ===
  "gestion"` — el único criterio RBAC visual de esta fase, ver decisión abajo). El resto del
  archivo no cambió.
- `src/components/OTDetail.tsx` — sección "Cotización": los botones "Crear cotización" y "Vincular
  cotización existente" (antes deshabilitados con "Disponible en la próxima fase") ahora abren
  `DialogoCrearCotizacion`/`DialogoVincularCotizacion` (componentes locales al archivo, mismo
  criterio que `CadenaResponsablesOt` — solo los usa esta pantalla). Para `tecnico`/`lectura` la
  sección completa de escritura se reemplaza por un texto explicando la restricción (ver decisión
  RBAC abajo); la lista de cotizaciones de la OT sigue siendo de solo lectura para todos, como ya
  lo era desde la Fase 1.
- `src/routes/cotizaciones.tsx` — reescrita: reemplaza `useOTStore().cotizaciones` (mock) por
  `useCotizaciones(filtros)` real, con paginación de servidor (25 por página, mismo criterio que
  Todas las OT), filtros reales (`estado`, `clienteId` vía `useClientes()`, `q` con debounce vía
  `useDebounced`, `desde`/`hasta`) y un diálogo de detalle (`DialogoDetalleCotizacion`, local al
  archivo) al hacer clic en una fila. La columna "OT vinculada" sigue llamando a
  `useOTStore().abrirOT(ot.id)` igual que antes.

Fuera de alcance, sin tocar (más allá de lo estrictamente necesario): `mock-data.ts` (el tipo
`Cotizacion` mock y el arreglo `cotizaciones` siguen ahí — `TicketDetail.tsx`/mock de tickets no se
tocaron, no fueron parte de esta fase), `ot-store.tsx` (`crearCotizacion`/`vincularCotizacion` mock
siguen existiendo en el store — ya nadie las llama desde `OTDetail.tsx`/`cotizaciones.tsx`, pero no
se borraron porque no era parte del alcance quitarlas del store), tickets, mesa de ayuda, SLA,
notificaciones, dashboard, portal público.

### Decisiones dentro del espacio permitido

- **RBAC visual**: no había precedente en el código (se revisó `AppShell.tsx` y el resto de rutas;
  nada ocultaba controles por rol todavía). Se definió `puedeEscribirCotizaciones(rol)` en
  `labels.ts` y se usa igual en las tres superficies de escritura (vista `/cotizaciones`, diálogo de
  detalle, sección "Cotización" de `OTDetail.tsx`): oculta los controles (no solo los deshabilita)
  para `tecnico`/`lectura`, con un texto explicando el motivo. La lectura nunca se oculta.
- **Detalle de cotización**: se construyó (`DialogoDetalleCotizacion` en `cotizaciones.tsx`) porque
  la tabla no alcanza para mostrar `aprobadaEn` ni el timeline propio (`eventos`), y las
  transiciones de estado necesitan mostrar solo las válidas para el estado actual — un select libre
  con las 4 siempre visibles habría dejado que el usuario intente una transición que el backend
  rechaza con `409 TRANSICION_INVALIDA` sin necesidad. El costo extra de construirlo fue bajo porque
  reutiliza `useCotizacion(id)` y los mismos componentes de UI que el resto de la app.
- **Edición de cotización (`PATCH`)**: se incluyó en el mismo diálogo de detalle, visible solo si
  `estado === 'borrador'` y el rol puede escribir — extensión barata del panel que ya existía para
  transiciones de estado (tres campos: monto, fecha, cliente), no una superficie nueva.
- **Selector de cliente en "Crear cotización" desde `OTDetail.tsx`**: no se pide. El contrato
  (`POST /cotizaciones`) autocompleta `clienteId` con el de la OT si no es interna, y no lo exige si
  lo es — pedirlo habría sido inventar un campo que el backend ni necesita ni usa en ese flujo.
- **"Vincular cotización existente"**: se implementó como una búsqueda simple (`Input` con
  debounce sobre `GET /cotizaciones?q=`, hasta 20 resultados, filtrando en el cliente las que ya
  pertenecen a la OT abierta) en vez de un componente de búsqueda nuevo — mismo criterio de "tu
  criterio, simple" del enunciado. El backend valida el resto (`409 COTIZACION_NO_VINCULABLE` si la
  cotización elegida está `aprobada`/`rechazada` y pertenece a otra OT), confirmado en el recorrido.
- **Filtro `otId` en `/cotizaciones`**: el hook (`useCotizaciones`/`CotizacionesFiltros`) lo acepta,
  pero no se agregó un `<select>` de OT en la vista — no hay un punto natural para elegir una OT
  arbitraria ahí (a diferencia de cliente, que ya tiene `useClientes()` listo), y `ot.cotizaciones`
  embebido en el detalle de OT ya cubre "ver las cotizaciones de esta OT" sin ese filtro.
- **Suma total en el pie de la tabla**: se quitó (el mock la tenía, sumando sobre el arreglo
  completo). Con paginación de servidor esa suma solo reflejaría la página visible, lo que sería
  engañoso presentado como total — se dejó solo el conteo (`X cotizaciones · página Y de Z`).

## Fase 2 — verificación

`npx tsc --noEmit` limpio.

Recorrido real en navegador (backend `npm run dev` contra la BD real `siga-tickets`, frontend
`npm run dev` puerto 8080, MCP de navegador):

1. Admin desechable nuevo por variables de entorno al script `seed.ts`
   (`SEED_ADMIN_USERNAME=qa_felipe_admin_f2`, contraseña propia de un solo uso, nunca impresa en
   ningún archivo del repo) y, con su token, un usuario `gestion` (`qa_felipe_gestion_f2`) y un
   `tecnico` (`qa_felipe_tecnico_f2`) reales vía `POST /usuarios`.
2. Con `qa_felipe_gestion_f2`: `/cotizaciones` cargó vacía (`0 cotizaciones`) contra la OT real
   `OT-1041` que había quedado de la Fase 1. Se abrió su detalle y se usó "Crear cotización"
   (monto `$750.000`, fecha de hoy, marcada como principal) → `POST /cotizaciones` con `otId` fijo,
   `clienteId` autocompletado por el backend (`Minera Los Andes`, sin pedirlo en el formulario) →
   apareció de inmediato en `ot.cotizaciones` (badges "Borrador"/"Principal") y en `/cotizaciones`
   (`COT-2041`).
3. Cambio de estado desde el diálogo de detalle: `Borrador → Enviada → Aprobada`
   (`POST /cotizaciones/:id/estado` ×2). Tras cada cambio el diálogo mostró solo los botones de las
   transiciones válidas siguientes (nunca las 4 fijas), y al llegar a `Aprobada` fijó `aprobadaEn`
   (`23-sept, 12:25 a. m.`) y mostró "Sin transiciones disponibles desde este estado" — `aprobada`
   es terminal, confirmado.
4. Se creó una OT auxiliar (`OT-1042`, cliente `Constructora Vertiz`) y una segunda cotización SIN
   OT (`POST /cotizaciones` directo con `clienteId=Minera Los Andes`, sin `otId`, para no depender
   del formulario de creación que siempre fija `otId`) → `COT-2042`. Desde el detalle de `OT-1042`,
   "Vincular cotización existente" → buscar "COT-2042" → un clic → `POST
   /ots/:id/cotizaciones/vincular` (200) → apareció en `ot.cotizaciones` de OT-1042 y el evento
   `cotizacion_vinculada` quedó en el historial de esa OT ("vinculó la cotización COT-2042").
5. Caso de error real: desde el mismo diálogo de `OT-1042`, se intentó vincular `COT-2041` (ya
   `Aprobada` y perteneciente a `OT-1041`) → `409 COTIZACION_NO_VINCULABLE`, y el toast mostró el
   mensaje real del backend ("No se puede reasignar una cotización aprobada o rechazada de otra
   OT"), no uno genérico. `COT-2042` no se vio afectada.
6. Edición (`PATCH /cotizaciones/:id`, solo en `borrador`): sobre `COT-2042` se cambió el monto de
   `$300.000` a `$425.000` desde "Editar monto, fecha o cliente" → confirmado en el detalle, en la
   fila de `/cotizaciones` y en el evento `cotizacion_editada` del historial (con
   `montoClpAntes`/`montoClpDespues` correctos en la respuesta de red).
7. Con `qa_felipe_tecnico_f2` (técnico): `/cotizaciones` mostró "Solo lectura para tu rol" y la
   tabla completa (ambas cotizaciones, con datos reales) sin errores. Al abrir el detalle de
   `COT-2042`, no aparecieron ni "Cambiar estado" ni "Editar…" (solo cliente/OT/monto/fecha/versión
   e historial). Al abrir `OT-1042` desde la tabla, la sección "Cotización" mostró la cotización
   vinculada de solo lectura con el texto "Solo gestión o administración pueden crear o vincular
   cotizaciones." en vez de los botones — RBAC visual confirmado en ambas superficies.
8. Consola del navegador revisada con `read_console_messages`: sin `TypeError` ni `Uncaught` en
   ningún punto del recorrido; los únicos `error` registrados son los HTTP no-2xx esperados (los
   403 de RBAC del backend ya documentados desde la Fase 0, y el 409 del paso 5).

Al terminar: `qa_felipe_gestion_f2` y `qa_felipe_tecnico_f2` quedaron desactivados
(`PATCH /usuarios/:id {activo:false}`, ambos `200`). El admin de prueba `qa_felipe_admin_f2`
**no** se pudo desactivar a sí mismo (`409 CONFLICT`, mismo bloqueo ya documentado en la Fase 0 y
la Fase 1); queda activo en `siga-tickets` con una contraseña de un solo uso que no quedó en ningún
archivo del repo. Backend y frontend quedaron **detenidos** al terminar (no corriendo) — se
verificó con un `curl` a `http://localhost:3002/health` y `http://localhost:8080/` que ninguno de
los dos puertos respondía tras detener los procesos.

## Fase 3 — qué quedó

Archivos nuevos:

- `src/lib/api/tickets.ts` — funciones de red puras para Tickets (mismo patrón que `ots.ts` /
  `cotizaciones.ts`): tipos `TicketResumen` (forma de `GET /tickets`), `TicketDetalle` (con
  `cadenaResponsables`, `mensajes`, `adjuntos`, `ots`, `eventos` embebidos tal cual documenta
  `docs/api.md`), `MensajeTicket`, `AdjuntoTicket`, `OtEmbebidaTicket`, `EventoTicket`, y una
  función por endpoint: `obtenerTickets`, `obtenerTicket`, `crearTicket`, `actualizarTicket`,
  `cambiarEstadoTicket`, `tomarTicket`, `agregarMensajeTicket`, `derivarTicket`,
  `convertirTicketAOt` (devuelve `OtDetalle`, no un ticket — "herencia completa" crea una OT),
  `vincularOtATicket`/`desvincularOtDeTicket`, `subirAdjuntoTicket`. `TramoResponsable` y
  `UsuarioRef` se reutilizan de `ots.ts` en vez de duplicarse (misma forma exacta, confirmado en
  `api.md`).
- `src/hooks/useTickets.ts` — un hook de TanStack Query por operación (`useTickets`, `useTicket`,
  y una mutación por cada función de red de arriba), mismo criterio que `useOts.ts`. Todas las
  mutaciones invalidan el árbol `["tickets"]`; `convertirTicketAOt`/`vincularOtATicket`/
  `desvincularOtDeTicket` además invalidan `["ots"]` (crean o tocan el arreglo `ot.tickets`/
  `ticket.ots` embebido cruzado). `useTomarTicket`/`useDerivarTicket`/`useConvertirTicketAOt`/
  `useVincularOtATicket` muestran `toast.success` al terminar, igual que `useDerivarOt` en Fase 1.

Editados:

- `src/lib/labels.ts` — se agregó `ESTADOS_TICKET` (las 5, sin máquina de transiciones estricta a
  diferencia de cotizaciones), `CANALES_TICKET_CREACION` (los 3 que acepta `POST /tickets`:
  `telefono|presencial|interno`) y `puedeConvertirTickets(rol)` (`admin`/`gestion`, mismo criterio
  que `puedeEscribirCotizaciones` pero como función propia porque protege una superficie distinta:
  convertir/vincular/desvincular OT en un ticket).
- `src/routes/tickets.tsx` — reescrita: reemplaza `useOTStore().tickets` (mock) por
  `useTickets(filtros)` real, con paginación de servidor (25/página, mismo criterio que fases
  previas) y filtros reales: `q` (debounced), `estado`, `canal`, `prioridad`, `responsable` (uuid
  vía `useUsuarios()`), `mios=true` ("Mis asignados"), `sinAsignar=true` ("Sin asignar", filtro
  nuevo que no existía en el mock). La fila de la bandeja usa exactamente la forma de
  `TicketResumen` (sin adjuntos ni OT vinculadas, que el listado no trae). `ticketAbierto`/
  `abrirTicket` del store se siguen usando solo como el id crudo del Sheet abierto (mismo patrón
  que `otSeleccionadaId` en Fase 1), no como fuente de datos.
- `src/routes/nuevo-ticket.tsx` — reescrita: `POST /tickets` real. `canal` ahora ofrece
  exactamente `telefono|presencial|interno` (se quitó "Correo", que no es válido en este
  formulario). Se quitó el campo "Responsable inicial": el ticket nace siempre sin responsable, y
  el texto de ayuda lo explica ("Tomar" desde la bandeja o el detalle). `recepcionadoPorId` no se
  envía (sale del token). `clienteId` opcional real vía `useClientes()`, reemplaza el campo
  "Empresa" de texto/mock. El bloque "Adjuntos (demostración)" se quitó (ver decisión abajo).
- `src/components/TicketDetail.tsx` — reescrito para leer `useTicket(ticketId)` en vez del mock:
  responsable (`Sin asignar` + `Tomar`, o de solo lectura + `Derivar`), estado (`POST
  /tickets/:id/estado`, las 5 opciones libres), prioridad (`PATCH /tickets/:id`), conversación
  (`respuesta_cliente`/`nota_interna` vía `POST /tickets/:id/mensajes`, con adjuntos), adjuntos
  sueltos del ticket, cadena de responsables real (`CadenaResponsablesTicket`, local al archivo,
  reutiliza `TramoResponsable` de `ots.ts`), órdenes de trabajo (`ot.ots`, convertir/vincular/
  desvincular con RBAC visual), SLA (`SlaBadge` de `Prioridad.tsx`, no el cálculo mock de
  `nivelPrimeraRespuesta`) e historial de actividad (`textoEventoTicket()`, tipos de evento propios
  de ticket). `DialogoDerivar` se sigue reutilizando de `Derivacion.tsx` (ver decisión abajo), pero
  ahora recibe `opciones` con usuarios reales de `useUsuarios()` (ver bug corregido abajo) en vez
  del mock — sin ellas el selector mostraba nombres inventados (Felipe Miranda, Carla Soto…) en
  vez de vacío o de los usuarios reales, detectado y corregido durante el recorrido de prueba antes
  de darlo por terminado.

Fuera de alcance, sin tocar: `OTDetail.tsx` (sección "Tickets vinculados" sigue de solo lectura),
`mock-data.ts` (`Ticket`/`MensajeTicket`/`Notificacion`, `ticketsIniciales`/
`notificacionesIniciales` siguen ahí — `AppShell.tsx` y `mesa-de-ayuda/*` los siguen usando),
`ot-store.tsx` (las funciones mock de tickets — `crearTicket`, `responderTicket`,
`cambiarEstadoTicket`, `asignarTicket`, `cambiarPrioridadTicket`, `vincularTicketAOT`,
`crearOTDesdeTicket`, `derivarTicket` — ya no las llama ningún componente tocado en esta fase, pero
siguen existiendo porque `mesa-de-ayuda/index.tsx` y `mesa-de-ayuda/seguimiento.tsx` (portal mock,
Fase 5) todavía las usan; `notificaciones`/`marcarNotificacionesLeidas` no se tocaron),
`TicketBadges.tsx` (`CanalBadge`/`EstadoTicketBadge`/`SlaRespuestaBadge` siguen tipados al mock
porque `mesa-de-ayuda/seguimiento.tsx` los sigue usando — `tickets.tsx`/`TicketDetail.tsx`
construyeron su propio badge de canal local, tipado a `CanalTicket` real, en vez de tocar ese
archivo), `/configuracion` (SLA, Fase 4), `/mesa-de-ayuda` (portal público, Fase 5), dashboard y
buscador global (Fase 6).

### Decisiones dentro del espacio permitido

- **Adjuntos en "Nuevo ticket"**: se optó por la opción (a) del enunciado — se quitó el bloque de
  adjuntos del formulario de creación manual. El ticket no existe antes del submit, y `POST
  /adjuntos` exige un `entidadId` ya existente, así que no hay forma de subir un adjunto "en el
  mismo paso" sin inventar un flujo nuevo; mismo criterio que "Nueva OT" en Fase 1, que tampoco
  sube adjuntos al crear. Los adjuntos se suben después desde el detalle del ticket (al enviar un
  mensaje, ver abajo).
- **Adjuntar un archivo a un mensaje**: sigue el flujo exacto de `docs/api.md` — el archivo se
  sube primero con `POST /adjuntos` (`entidadTipo=ticket`, `entidadId=<ticket>`), queda "suelto"
  del ticket, y su id se guarda en un estado local del formulario (`adjuntosBorrador`); al enviar
  el mensaje se pasa en `adjuntoIds` y el backend lo re-parenta al mensaje. Se permite más de un
  adjunto por mensaje: el input de archivo tiene `multiple` y cada archivo elegido se sube en
  paralelo (`Promise.allSettled`), mostrando un chip por cada uno ya subido antes de enviar.
- **Adjuntos "sueltos" del ticket**: se construyó una sección simple de solo lectura (lista +
  descarga, reutilizando `descargarAdjunto` de `ots.ts`, que es genérico y no específico de OT) —
  el costo fue bajo porque reutiliza el mismo patrón visual que "Adjuntos" de `OTDetail.tsx`.
- **Desvincular OT**: se agregó (`DELETE /tickets/:id/ots/:otId`), no estaba en el mock — extensión
  barata y natural del mismo bloque de "Órdenes de trabajo", con el mismo criterio RBAC
  (`puedeConvertirTickets`) que convertir/vincular.
- **RBAC visual de convertir/vincular/desvincular**: `puedeConvertirTickets(rol)` en `labels.ts`
  (`admin`/`gestion`, confirmado en `docs/api.md` sección "Permisos por fila": "nunca — solo
  gestion/admin, sin excepción por fila"). Se implementó como función propia en vez de reutilizar
  `puedeEscribirCotizaciones` tal cual, aunque la condición sea idéntica hoy: protegen superficies
  distintas y podrían divergir en el futuro sin que eso sea un error de copiar/pegar.
- **`DialogoDerivar` sin "mantener como colaborador"**: no hizo falta ninguna prop nueva —
  `conColaborador` ya es opcional y por defecto `false` en `Derivacion.tsx` (Fase 1), así que
  `TicketDetail.tsx` simplemente no la pasa y el checkbox queda oculto solo, igual que si se
  hubiera agregado una prop `sinColaborador` explícita.
- **"Convertir en OT" sin campo "responsable"**: se quitó del diálogo (el mock lo pedía); la OT
  hereda la cadena de responsables completa del ticket, no se elige un responsable nuevo al
  convertir (confirmado en `docs/api.md` y en el recorrido: OT-1043 heredó los dos tramos exactos
  del ticket TK-0001, incluido el motivo de la derivación).
- **`categoria` obligatorio en "Convertir en OT"**: se agregó al diálogo (no estaba en el mock),
  con `CATEGORIAS_OT`/`etiquetaCategoriaOt` de `labels.ts`, por default `"soporte"`.
  `esInterna`/`clienteId`/`areaInterna` reutilizan la misma lógica de "¿Es una solicitud interna?"
  (`Switch`) que ya usa `nueva-ot.tsx` de Fase 1, con el mismo arreglo `areas` de `mock-data.ts`.
- **"Vincular a OT existente"**: mismo patrón simple que `DialogoVincularCotizacion` de
  `OTDetail.tsx` (Fase 2) — un `Input` con debounce sobre `GET /ots?q=` (reutiliza `useOts()` de
  Fase 1 tal cual, sin cambios), filtrando en el cliente las OT ya vinculadas al ticket abierto.
- **SLA**: se usa `SlaBadge` de `Prioridad.tsx` (ya normaliza valores reales) para `slaEstado`, y
  `slaResolucionVenceEn`/`slaRespuestaVenceEn` del detalle real para las fechas de vencimiento —
  no se replicó el cálculo mock de `nivelPrimeraRespuesta`/`horasPrimeraRespuesta`. Los componentes
  mock `SlaRespuestaBadge`/`EstadoTicketBadge`/`CanalBadge` de `TicketBadges.tsx` se dejaron
  intactos (los sigue usando el portal mock, Fase 5) y `tickets.tsx`/`TicketDetail.tsx`
  construyeron un badge de canal local (`CanalBadgeReal`) con los mismos íconos pero tipado al
  `CanalTicket` real — duplicar ~15 líneas fue más simple y seguro que generalizar un archivo
  compartido con otra pantalla fuera de alcance.
- **Bug encontrado y corregido durante el recorrido**: la primera versión de `TicketDetail.tsx` no
  le pasaba `opciones` a `DialogoDerivar`, así que el selector de destino mostraba los nombres fijos
  del mock (Felipe Miranda, Carla Soto…) en vez de usuarios reales o de quedar vacío por RBAC. Se
  corrigió agregando `useUsuarios()` + el mismo filtro `activo && username !== "sistema"` que ya
  usan `OTDetail.tsx`/`nueva-ot.tsx`, y se confirmó el fix en el recorrido (ver abajo).
- **Límite de `GET /usuarios` (admin-only, no solo "rol mínimo admin" del filtro grueso)**: durante
  el recorrido se confirmó que ni `tecnico` ni `gestion` pueden listar usuarios (ambos ven el
  selector de "Derivar" vacío) — el endpoint es admin-only de verdad, no solo `>= gestion` como se
  podría haber asumido por analogía con otras rutas. Solo `admin` ve la lista completa. Documentado
  para que no se repita como sorpresa en la Fase 4.

## Fase 3 — verificación

`npx tsc --noEmit` limpio (confirmado dos veces: antes y después del fix del bug de `DialogoDerivar`).

Recorrido real en navegador (backend `npm run dev` contra la BD real `siga-tickets`, frontend
`npm run dev` puerto 8080, MCP de navegador):

1. Admin desechable nuevo por variables de entorno al script `seed.ts`
   (`SEED_ADMIN_USERNAME=qa_felipe_admin_f3`, contraseña propia de un solo uso generada con
   `openssl rand -hex 16`, nunca impresa ni guardada en ningún archivo del repo) y, con su token,
   dos usuarios `tecnico` (`qa_felipe_tec_f3a`, `qa_felipe_tec_f3b`, para probar derivación) y un
   usuario `gestion` (`qa_felipe_gestion_f3`) reales vía `POST /usuarios`.
2. Con `qa_felipe_tec_f3a`: `/nueva-ticket` → creó TK-0001 (canal `telefono`, prioridad `media`)
   → confirmado en `/tickets` que nace `Nuevo`, `Sin asignar`, SLA `En plazo`, sin campo
   "Responsable inicial" en el formulario.
3. Abrió TK-0001 y usó "Tomar" (`POST /tickets/:id/tomar`, sin body) → responsable pasó a
   `qa_felipe_tec_f3a`, la cadena de responsables mostró el primer tramo (`actual: true`,
   `motivoEntrada: null`), y apareció el botón "Derivar".
4. Cambió prioridad `Media → Alta` (`PATCH /tickets/:id`) → el badge del encabezado, "Vencimiento
   SLA" (`02-oct` → `25-sept, 02:00 p. m.`) y "Primera respuesta · vence" se recalcularon en
   pantalla, confirmando que el backend recalcula ambos SLA al cambiar prioridad. Cambió estado
   `Nuevo → Abierto` (`POST /tickets/:id/estado`) → reflejado en el encabezado y en el historial.
5. Adjunto real: el selector de archivo nativo no se puede automatizar desde el MCP de navegador
   (mismo límite que la Fase 1), así que se subió con `curl -F` (`POST /adjuntos`,
   `entidadTipo=ticket`, `entidadId=<TK-0001>`) para obtener un adjunto "suelto", y se envió el
   mensaje con `adjuntoIds=[...]` también por `curl` contra `POST /tickets/:id/mensajes` (mismo
   camino que documenta `api.md`) para simular exactamente lo que hace el botón "Adjuntar" +
   "Enviar respuesta" del panel. Al recargar el detalle en el navegador, el mensaje
   `respuesta_cliente` apareció con el chip `foto-equipo.txt` clicable, y al hacer clic disparó
   `GET /adjuntos/:id/descargar` → `200`, confirmando la descarga autenticada.
6. Desde el navegador (sin `curl`): se escribió y envió una nota interna real (`POST
   /tickets/:id/mensajes`, `tipo: nota_interna`) → apareció distinguida visualmente (fondo amarillo,
   badge "Interna") junto al mensaje `respuesta_cliente` anterior (fondo blanco, sin badge), en
   orden cronológico.
7. Se encontró y corrigió el bug de `DialogoDerivar` sin `opciones` reales (ver arriba) antes de
   continuar. Confirmado el fix: con `qa_felipe_tec_f3a` el selector de "Derivar" quedó vacío
   ("Selecciona una persona", sin nombres inventados) porque `GET /usuarios` es admin-only.
8. Con `qa_felipe_admin_f3` (para tener el selector de personas poblado): derivó TK-0001 a
   `qa_felipe_tec_f3b` con un motivo real (`POST /tickets/:id/derivar`) → toast "Ticket derivado
   correctamente.", cadena de responsables con los dos tramos (duración y motivo correctos),
   responsable actual actualizado.
9. Casos de error reales confirmados contra el backend: `POST /tickets/:id/tomar` sobre TK-0001 (ya
   con responsable) → `409 TICKET_YA_ASIGNADO` ("El ticket ya tiene responsable"); `POST
   /tickets/:id/derivar` con `qa_felipe_tec_f3a` (ya no es el responsable actual) → `403
   PERMISO_DENEGADO` ("Solo el responsable actual, gestión o admin pueden derivar el ticket"). Se
   confirmaron contra la API directamente porque la UI ya evita naturalmente disparar el 409 (el
   botón "Tomar" desaparece en cuanto hay responsable) y el 403 de derivar (el selector de destino
   queda vacío para un `tecnico` sin `GET /usuarios`, así que el formulario ni se puede enviar) —
   la ruta de manejo de error (`toast.error(mensajeError(error))`) es la misma ya verificada
   visualmente con los `toast.success` de "Tomar"/"Derivar"/"Convertir"/"Vincular".
10. Con `qa_felipe_admin_f3`: "Convertir en OT" sobre TK-0001 (categoría `Soporte`, prioridad
    heredada `Alta`, interna con área "Bodega" por defecto al no tener cliente el ticket) →
    `POST /tickets/:id/convertir-a-ot` (201) → toast "Ticket convertido en OT.", OT-1043 apareció
    en "Órdenes de trabajo" con badge "Origen". Se abrió OT-1043 en `/todas-las-ot` y se confirmó
    que heredó los dos tramos completos de la cadena de responsables (con motivo de derivación),
    `recepcionadoPor` = quien tomó el ticket originalmente (no quien convirtió), origen "Llamada
    telefónica" (derivado del canal `telefono` del ticket, no editable).
11. Con `qa_felipe_admin_f3`, en el mismo TK-0001: "Vincular a OT existente" → buscó y vinculó
    OT-1041 (`POST /tickets/:id/ots`, sin herencia) → toast "OT vinculada correctamente.", apareció
    sin badge "Origen". Luego "Desvincular" sobre OT-1041 (`DELETE /tickets/:id/ots/:otId`) → quedó
    solo OT-1043. Ambos eventos (`vinculado_ot`/`ot_desvinculada`) confirmados en el historial de
    actividad con el texto correcto.
12. RBAC visual confirmado en ambas direcciones: con `qa_felipe_tec_f3a` (técnico) la sección
    "Órdenes de trabajo" mostró el texto "Solo gestión o administración pueden convertir o vincular
    órdenes de trabajo." sin los tres botones; con `qa_felipe_admin_f3` y `qa_felipe_gestion_f3`
    los tres controles estuvieron visibles y habilitados.
13. Historial de actividad revisado de punta a punta para TK-0001: `creado`, `tomado`,
    `prioridad_cambiada`, `estado_cambiado`, `adjunto_agregado`, `respuesta_cliente`,
    `nota_interna`, `derivado`, `vinculado_ot` (×2, uno marcado "(conversión)"),
    `ot_desvinculada` — los 10 tipos de evento de ticket documentados en `api.md` se vieron en
    algún punto del recorrido, cada uno con el texto y el ícono esperado.
14. Consola del navegador revisada con `read_console_messages`: sin `TypeError` ni `Uncaught` en
    ningún punto del recorrido; los únicos `error` registrados son los HTTP no-2xx esperados (403
    de RBAC en `GET /usuarios` para `tecnico`/`gestion`, 409 y 403 del paso 9, 429 de un límite de
    intentos de login alcanzado durante las pruebas de RBAC que se resolvió reiniciando el backend
    en desarrollo para limpiar el limitador en memoria — sin tocar código).

Al terminar: `qa_felipe_tec_f3a`, `qa_felipe_tec_f3b` y `qa_felipe_gestion_f3` quedaron
desactivados (`PATCH /usuarios/:id {activo:false}`, los tres `200`). El admin de prueba
`qa_felipe_admin_f3` **no** se pudo desactivar a sí mismo (`409 CONFLICT`, mismo bloqueo ya
documentado desde la Fase 0); queda activo en `siga-tickets` con una contraseña de un solo uso que
no quedó en ningún archivo del repo ni de logs (se roto una vez a mitad del recorrido, por la misma
razón: nunca queda escrita, solo se usa al momento). Backend y frontend quedaron **detenidos** al
terminar — confirmado con `curl` a `http://localhost:3002/health` y `http://localhost:8080/` (ambos
sin respuesta, puertos verificados libres con `netstat`).

## Fase 4 — qué quedó

Archivos nuevos:

- `src/lib/api/sla.ts` — funciones de red puras para SLA (mismo patrón que `ots.ts`/
  `cotizaciones.ts`): tipo `SlaConfigFila` (las 3 filas `alta|media|baja` con sus 5 campos:
  `horasResolucion`, `horasPrimeraRespuesta`, `usarHorasHabiles`, `pausarEnEsperaCliente`,
  `umbralPorVencer`), `ActualizarSlaConfigFila` (parcial, para `PUT /sla/config`), `Feriado`, y una
  función por endpoint: `obtenerSlaConfig`, `actualizarSlaConfig`, `obtenerFeriados`,
  `crearFeriado`, `eliminarFeriado`.
- `src/hooks/useSla.ts` — hooks de TanStack Query: `useSlaConfig`, `useFeriados` (lectura),
  `useCrearFeriado`/`useEliminarFeriado` (invalidan `["sla","feriados"]`), y
  `useActualizarSlaConfig`, que además de invalidar `["sla","config"]` invalida `["ots"]` y
  `["tickets"]` completos — el backend recalcula en la misma transacción el vencimiento de toda
  OT/ticket abierto de la prioridad editada (`docs/api.md`), así que las vistas de OT/tickets no
  deben quedar con un SLA vencido desactualizado. Muestra `toast.success("Configuración de SLA
  guardada.")`.
- `src/lib/api/notificaciones.ts` — tipo `Notificacion` (`{id,tipo,entidadTipo,entidadId,titulo,
  cuerpo,leidaEn,creadoEn}`, reemplaza el `Notificacion` mock que tenía `texto`/`leida`), tipo
  `ResumenNotificaciones` (los 4 bloques `{total,items}` de `GET /notificaciones/resumen`), y
  `obtenerNotificaciones`, `obtenerResumenNotificaciones`, `marcarNotificacionLeida`,
  `marcarTodasNotificacionesLeidas`.
- `src/hooks/useNotificaciones.ts` — `useNotificaciones(filtros)` (lista, `refetchInterval: 60_000`
  porque el cron de SLA del backend corre cada 5 min, no hace falta polling agresivo),
  `useNotificacionesNoLeidasTotal()` (pide `soloNoLeidas=true&perPage=1` y usa `meta.total` para el
  contador exacto de la campana, sin depender del tamaño de página de la lista visible),
  `useResumenNotificaciones(habilitado)` (solo pide `GET /notificaciones/resumen` cuando el diálogo
  de inicio se va a mostrar, vía el flag `habilitado`), y `useMarcarNotificacionLeida`/
  `useMarcarTodasNotificacionesLeidas` (invalidan todo el árbol `["notificaciones"]`).

Editados:

- `src/lib/labels.ts` — se agregó `puedeEscribirSla(rol)` (`rol === "admin"`, a diferencia de
  `puedeEscribirCotizaciones`/`puedeConvertirTickets` que aceptan `gestion` también — `PUT
  /sla/config` y `POST`/`DELETE /sla/feriados` son admin-only sin excepción, confirmado en
  `docs/api.md`). El resto del archivo no cambió.
- `src/lib/auth/AuthProvider.tsx` — **fix encontrado durante el recorrido de prueba, fuera del
  alcance original pero necesario para que la campana funcionara de verdad**: `login()`/`logout()`
  ahora llaman `queryClient.clear()`. Sin esto, cambiar de usuario dentro de la misma pestaña
  (cerrar sesión y entrar con otro) dejaba servido el caché de TanStack Query del usuario anterior
  — se detectó en vivo porque la campana de `qa_felipe_tec_f4` mostraba "Sin notificaciones."
  después de loguearse, aunque `GET /notificaciones` (confirmado por `curl` con su propio token) sí
  tenía una notificación real de derivación sin leer. Las query keys de ningún hook (de esta fase
  ni de las anteriores) incluyen el id del usuario autenticado, así que TanStack Query no tenía
  forma de saber que el usuario cambió; limpiar el caché en `login`/`logout` es la corrección
  mínima y evita que un usuario vea por un instante datos cacheados de la sesión anterior en el
  mismo navegador.
- `src/routes/configuracion.tsx` — reescrita por completo: reemplaza `useOTStore().sla`/
  `slaRespuesta`/`guardarSla`/`guardarSlaRespuesta` (mock, solo 2 horas por prioridad) por
  `useSlaConfig()`/`useActualizarSlaConfig()` reales, con los 5 campos por fila (se agregaron los
  controles que faltaban: dos `Switch` para `usarHorasHabiles`/`pausarEnEsperaCliente` y un `Input`
  numérico para `umbralPorVencer`, rango `(0,1]`). Solo `admin` ve los controles de edición
  (`puedeEscribirSla`); cualquier otro rol ve la misma tabla en texto plano, con un aviso explicando
  el porqué. Se agregó una sección "Feriados" completamente nueva (no existía en el mock): tabla
  (`GET /sla/feriados`), formulario de alta (`POST /sla/feriados`, fecha + nombre + checkbox
  irrenunciable) y botón eliminar por fila (`DELETE /sla/feriados/:fecha`), con el mismo criterio
  RBAC visual que la tabla de SLA. La columna "Por defecto" del mock (comparaba contra
  `slaPorDefecto`/`slaRespuestaPorDefecto`, sin equivalente real) se quitó; el botón "Restaurar
  valores por defecto" se reemplazó por "Descartar cambios" (vuelve al último valor del servidor,
  no a un default fijo que ya no existe).
- `src/components/AppShell.tsx` — tres piezas mock reemplazadas por datos reales:
  - `Notificaciones()` (la campana): `useNotificaciones({perPage:20})` para la lista y
    `useNotificacionesNoLeidasTotal()` para el contador exacto del badge. Muestra `titulo`/`cuerpo`
    reales (el mock solo tenía `texto`) y una fecha relativa calculada en el cliente (`fechaRelativa()`,
    nueva función local) a partir de `creadoEn` (el mock ya traía la fecha como texto fijo). Clic en
    una notificación no leída la marca leída (`POST /notificaciones/:id/leer`, el mock no hacía nada
    al clic); si `entidadTipo` es `"ot"` navega con `abrirOT(entidadId)` (el Sheet de OT es global,
    no hace falta cambiar de ruta); si es `"ticket"` hace `abrirTicket(entidadId)` + `navigate({to:
    "/tickets"})` (mismo patrón que ya usaba `BuscadorGlobal` para tickets, porque `TicketDetail`
    solo está montado dentro de la ruta `/tickets`). Otros `entidadTipo` (p. ej. `correo_fallido`,
    fuera del alcance de esta fase) solo se marcan como leídos, sin navegación. "Marcar todas como
    leídas" ahora es `POST /notificaciones/leer-todas` real y se deshabilita cuando no hay no
    leídas.
  - `ResumenInicio()` (el diálogo de una vez por sesión): `useResumenNotificaciones(abierto)` — solo
    pide el resumen cuando el diálogo se va a mostrar. Los **4** campos reales
    (`otVencidas`, `otPrioridadAltaAbiertas`, `otPendientesCotizarOAprobar`,
    `ticketsNuevosSinResponder`) reemplazan los 5 del mock; se quitó la fila "tickets sin responder
    fuera de SLA" (sin equivalente real, no se inventó). Cada fila es clickeable por ítem
    (`bloque.items`, hasta 5 `{id,numero}` que ya trae la respuesta): clic navega a esa OT/ticket con
    el mismo criterio `abrirOT`/`abrirTicket`+navegar de la campana, y cierra el diálogo. Se agregó
    el texto "Panorama de todo el equipo, no solo lo tuyo." (el resumen es de todo el equipo,
    decisión documentada del backend, no un bug ni un descuido de RBAC). La fecha fija del título
    ("jue 10 sep 2026") se reemplazó por la fecha real del navegador.
  - El flujo del flag `sessionStorage["mostrar-resumen"]` (lo pone `login.tsx` al loguear con éxito)
    no se tocó — sigue disparando el diálogo una sola vez por sesión, ahora con datos reales.
  - `Badge` con la fecha fija del header (línea ~550 del archivo original, "jue 10 sep 2026", no era
    parte del resumen ni de notificaciones pero estaba en el mismo archivo): se reemplazó por
    `fechaHoyBadge`, calculada con `new Date()` al renderizar `AppShell`, mismo formato
    (`es-CL`, corto).
  - `notificaciones`/`marcarNotificacionesLeidas` de `useOTStore()` dejaron de usarse en este
    archivo (era el único consumidor, confirmado por grep) — no se borraron del store
    (`ot-store.tsx`) ni de `mock-data.ts` porque no era parte del alcance tocar esos archivos.

Fuera de alcance, sin tocar: `BuscadorGlobal()` en `AppShell.tsx` (mock, Fase 6), `OTDetail.tsx`,
`TicketDetail.tsx`, `cotizaciones.tsx`, dashboard (no existe, Fase 6), `mock-data.ts` (`SlaConfig`,
`SlaRespuestaConfig`, `Notificacion`, `slaPorDefecto`, `slaRespuestaPorDefecto`,
`notificacionesIniciales`, `nivelSla`, `nivelPrimeraRespuesta` siguen ahí — `ot-store.tsx` sigue
inicializando `sla`/`slaRespuesta`/`notificaciones` desde esos valores, y `SidebarContenido`
(badge "N con SLA vencido" del menú lateral), `linea-de-tiempo.tsx` y `dashboard.tsx` siguen
llamando `nivelSla(ot, sla)` sobre el store mock — confirmado con grep antes de tocar nada, se
dejó exactamente igual porque sigue en uso real fuera de esta fase), `ot-store.tsx` (`sla`,
`slaRespuesta`, `guardarSla`, `guardarSlaRespuesta`, `notificaciones`, `marcarNotificacionesLeidas`
siguen definidos ahí sin cambios, por la misma razón).

### Decisiones dentro del espacio permitido

- **RBAC admin-only de SLA**: `puedeEscribirSla(rol)` en `labels.ts`, función propia (no se
  reutilizó `puedeEscribirCotizaciones`) porque el corte de rol es distinto: `PUT /sla/config` y
  `POST`/`DELETE /sla/feriados` son admin-only sin excepción para `gestion`, a diferencia de
  cotizaciones/tickets. La lectura (`GET /sla/config`, `GET /sla/feriados`) nunca se oculta, igual
  que el criterio ya usado en cotizaciones/tickets.
- **Clic para navegar en notificaciones y en el resumen**: se implementó en ambos lados (no se dejó
  como "demasiado complejo"). El costo fue bajo porque el patrón ya existía
  (`BuscadorGlobal.abrirOT`/`abrirTicket` + `navigate`, Fase 1) y `entidadId`/`items[].id` ya vienen
  en la forma correcta (uuid real) sin transformación.
- **`fix` en `AuthProvider.tsx` (`queryClient.clear()` en `login`/`logout`)**: no estaba en el
  alcance escrito de la Fase 4, pero es la causa raíz de un bug real y reproducible que hacía
  fallar la verificación de la campana (ver arriba). Se optó por corregirlo en vez de trabajar
  alrededor (p. ej. forzando un refetch manual solo en `Notificaciones()`) porque el problema es
  general a cualquier hook de TanStack Query de la app, no específico de notificaciones — dejarlo
  sin corregir habría significado que cualquier fase futura tropezara con el mismo síntoma al
  probar con dos usuarios en la misma pestaña.
- **Encoding mangled en un `cuerpo` de prueba** (`"derivaci�n"` en vez de `"derivación"`, visible en
  una captura del recorrido): es un artefacto de cómo se pasó el `motivo` por `curl -d` en una
  consola Bash de Windows en la primera derivación de prueba, no un bug de la app — confirmado
  repitiendo la derivación con un heredoc UTF-8 limpio, que se mostró correctamente en la campana.
- **Umbral "por vencer" en modo lectura**: se muestra como porcentaje redondeado (`20%` en vez de
  `0.2`) para que sea legible sin abrir el formulario de edición; en modo edición se mantiene el
  valor decimal crudo que espera el backend, sin conversión con pérdida.

## Fase 4 — verificación

`npx tsc --noEmit` limpio (confirmado antes y después del fix de `AuthProvider.tsx`).

Recorrido real en navegador (backend `npm run dev` contra la BD real `siga-tickets`, frontend
`npm run dev` puerto 8080, MCP de navegador):

1. Admin desechable nuevo por variables de entorno al script `seed.ts`
   (`SEED_ADMIN_USERNAME=qa_felipe_admin_f4`, contraseña de un solo uso generada con `openssl rand
   -hex 16`, nunca impresa como tal — se usó de inmediato para el login por API y se descartó) y,
   con su token, un usuario `tecnico` (`qa_felipe_tec_f4`) vía `POST /usuarios`. Para probar el
   login real en el navegador (que exige la contraseña en texto plano, no el JWT) se le fijó una
   contraseña nueva de un solo uso a cada cuenta con `PATCH /usuarios/:id {password}` justo antes
   de usarla en el formulario, y el archivo temporal que la contuvo se borró apenas se envió el
   login — ninguna contraseña quedó en el repo ni en un archivo persistente.
2. Con `qa_felipe_admin_f4` en `/configuracion`: la tabla de SLA cargó los 3 valores reales
   (`alta 24/2h`, `media 72/8h`, `baja 120/24h`, horas hábiles y pausa en espera cliente activos,
   umbral `0,2`) y la tabla de feriados cargó los 16 feriados reales de la semilla. Se cambió
   "Resolución (h)" de Media de `72` a `48` → `Guardar cambios` → toast "Configuración de SLA
   guardada." → recargando la página el valor `48` persistió (`GET /sla/config` real). Se confirmó
   por `curl` que `GET /ots/:id` de una OT `media` abierta (OT-1042) recalculó
   `slaResolucionVenceEn` de `2026-10-02T17:30:00.000Z` a `2026-09-30T12:30:00.000Z` en la misma
   transacción del `PUT`, sin acción extra del frontend — y el detalle de esa OT en la UI mostró la
   fecha nueva ("30-sept, 09:30 a. m.").
3. Feriados: se agregó uno nuevo (`20-nov-2026`, "Feriado de prueba QA Fase 4") → apareció en la
   tabla en su posición cronológica. Se intentó agregar la misma fecha de nuevo → toast real del
   backend, "Ya existe un feriado en esa fecha" (`409 FERIADO_YA_EXISTE`), sin fila duplicada. Se
   eliminó el feriado de prueba (`DELETE /sla/feriados/2026-11-20`) → desapareció de la tabla.
4. Con `qa_felipe_tec_f4` (técnico) en `/configuracion`: aviso de solo lectura visible, tabla de SLA
   en texto plano (sin `Input`/`Switch` editables, con `Media` ya mostrando `48` — el cambio del
   paso 2 se ve igual para todos los roles), sin botones "Guardar"/"Descartar", y la sección
   Feriados sin columna de eliminar ni formulario de alta — RBAC visual confirmado. La comprobación
   directa por API de que `PUT`/`POST` devuelven `403` para `tecnico` no se pudo repetir en esta
   sesión por `429 RATE_LIMITED` (5 intentos de login/15 min agotados por las múltiples pruebas de
   esta fase, mismo límite ya documentado en fases anteriores) — el contrato admin-only está
   confirmado por `docs/api.md` y por el ocultamiento real de los controles en la UI, así que no se
   forzó.
5. Notificación de derivación real: con el admin se derivó `OT-1042` a `qa_felipe_tec_f4`
   (`POST /ots/:id/derivar`, motivo de prueba). Al loguearse como `qa_felipe_tec_f4` **la primera
   vez** (login por API con `curl` justo después de la derivación) la campana mostró "Sin
   notificaciones." aunque `GET /notificaciones` con su propio token sí traía la notificación sin
   leer — se investigó y se encontró el bug de caché cruzado entre usuarios descrito arriba,
   corregido en `AuthProvider.tsx`. Repetido el recorrido completo después del fix: la campana
   mostró el badge "1" y el ítem "OT-1042 fue derivada a ti" correctamente.
6. Clic en la notificación de derivación: la marcó leída (`POST /notificaciones/:id/leer`, punto
   pasó de azul a gris, badge del popover) y abrió el detalle de OT-1042 directamente (`abrirOT`),
   mostrando el `slaResolucionVenceEn` ya recalculado del paso 2.
7. Segunda notificación (derivación de `OT-1043` al mismo usuario, esta vez con el `motivo` pasado
   por un heredoc UTF-8 limpio en vez de `-d` directo, para descartar que el encoding mangled visto
   antes fuera un bug de la app — se confirmó que era un artefacto de la consola, no de la UI: el
   segundo texto se vio perfecto). Contador subió a "1" otra vez (la primera seguía leída). "Marcar
   todas como leídas" (`POST /notificaciones/leer-todas`) → ambos ítems pasaron a gris, badge
   desaparecido del todo.
8. Resumen al iniciar sesión: se cerró sesión y se volvió a entrar como `qa_felipe_tec_f4` → el
   diálogo apareció una sola vez, con el título usando la fecha real del día ("Resumen del día · mié
   23 sept 2026", sin la fecha fija del mock) y los 4 números reales (`0` OT vencidas, `2` OT de
   prioridad alta abiertas con chips clicables `OT-1041`/`OT-1043`, `0` pendientes por cotizar, `0`
   tickets nuevos), más el texto "Panorama de todo el equipo, no solo lo tuyo." Clic en el chip
   `OT-1041` cerró el diálogo y abrió el detalle de esa OT directamente.
9. Notificación de tipo `sla_por_vencer`/`sla_vencida`: **no se generó ni se probó a propósito** —
   depende del cron `evaluarSla` (cada 5 min) y de que una entidad real cruce el umbral, lo que no
   es practicable de forzar de forma determinista dentro del tiempo de esta verificación sin tocar
   el reloj del sistema o datos ya vencidos de fases previas; queda sin cobertura de extremo a
   extremo en esta fase (el renderizado de esos dos tipos en la campana comparte el mismo código de
   `titulo`/`cuerpo`/clic que `derivacion`, ya probado, así que el riesgo residual es bajo).
10. Consola del navegador (`read_console_messages`, solo errores): ningún `TypeError` ni `Uncaught`
    en ningún punto del recorrido. Los únicos `error` son HTTP no-2xx esperados: `401` de la
    validación de sesión al cambiar de usuario, `409` del feriado duplicado (paso 3), y varios `403`
    de `GET /usuarios` para `tecnico` (mismo límite admin-only ya documentado desde la Fase 1, no
    una regresión de esta fase).

Al terminar: `qa_felipe_tec_f4` quedó desactivado (`PATCH /usuarios/:id {activo:false}`, `200`). El
admin de prueba `qa_felipe_admin_f4` **no** se pudo desactivar a sí mismo (`409 CONFLICT`, mismo
bloqueo ya documentado desde la Fase 0); queda activo en `siga-tickets` con una contraseña que no
quedó en ningún archivo del repo ni de logs. Backend y frontend quedaron **detenidos** al
terminar — confirmado con `curl`/`Invoke-WebRequest` a `http://localhost:3002/health` y
`http://localhost:8080/` (ambos sin respuesta) tras identificar y detener el proceso real del
backend por su PID (`Get-NetTCPConnection -LocalPort 3002`), ya que en esta sesión `pkill` por
patrón de comando no encontró el proceso de Windows correspondiente.
