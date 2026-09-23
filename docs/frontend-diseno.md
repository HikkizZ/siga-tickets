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
- **Fase 5**: hecha (2026-09-23). Detalle abajo.
- **Fase 6**: hecha (2026-09-23). Última fase del plan — detalle abajo, con nota de cierre al final del documento.

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

## Fase 5 — qué quedó

Portal público de la mesa de ayuda (`/mesa-de-ayuda`, `/mesa-de-ayuda/seguimiento`) contra
`/publico/*` (docs/api.md, sección "Pública (Fase 5)"), reemplazando el 100% mock que traían ambas
rutas (`useOTStore().crearTicket`/`responderComoCliente`).

Archivos nuevos:

- `src/lib/api/portal.ts` — funciones de red puras contra `/publico/*` (mismo patrón que
  `tickets.ts`/`ots.ts`, pero todas sobre `publicApiClient`, nunca `apiClient`): `crearTicketPublico`
  (`POST /publico/tickets`, multipart con `nombre,correo,empresa?,asunto,descripcion,prioridad?` +
  archivos en el campo `adjuntos` + un `captchaToken` placeholder fijo — ver decisión de captcha
  abajo), `solicitarSeguimiento` (`POST /publico/tickets/seguimiento`), `obtenerTicketPublico`
  (`GET /publico/ticket`, tipo `TicketPublico` reducido tal cual lo documenta `api.md`: sin id
  interno, `mensajes` sin notas internas, `ot` sin horas/montos/cotizaciones),
  `responderComoClientePublico` (`POST /publico/ticket/mensajes`, multipart `cuerpo` + `adjuntos?`
  en la misma request) y `adjuntarArchivoPublico` (`POST /publico/adjuntos`, un solo archivo en el
  campo `archivo`).
- `src/lib/portal/token.ts` — el token de portal (JWT `scope:"portal"`, TTL 15 min) en
  `sessionStorage` (no `localStorage`, a propósito: portal de cara al público, equipos
  compartidos), junto con el `numero` del ticket al que corresponde. Mismos try/catch de SSR/modo
  privado que `src/lib/auth/token.ts`, pero es un módulo separado — nunca se mezcla con el JWT
  interno.
- `src/hooks/usePortal.ts` — hooks de TanStack Query (mismo criterio que `useTickets.ts`), sin
  invalidación cruzada con `["tickets"]`/`["ots"]` (el portal no comparte caché con el panel):
  `useCrearTicketPublico`, `useSolicitarSeguimiento` (al llegar el token lo guarda de inmediato con
  `setPortalToken`), `useTicketPublico` (`retry:false` — un 401 nunca se arregla reintentando),
  `useResponderComoClientePublico`, `useAdjuntarArchivoPublico`, `useLimpiarCachePortal` (limpia del
  caché de React Query el detalle por token, al volver al formulario de búsqueda).

Editados:

- `src/lib/api/client.ts` — se agregó `publicApiClient.postForm` (mismo criterio que
  `apiClient.postForm` de la Fase 1: multipart/form-data, sin `Content-Type` manual), pero contra
  `PORTAL_URL` y con `portalToken` opcional (se manda como `Authorization: Bearer <portalToken>`,
  nunca el JWT interno). Los tres endpoints multipart del portal lo usan.
- `src/routes/mesa-de-ayuda/index.tsx` — reescrita: formulario real contra
  `POST /publico/tickets`. `prioridad` usa los valores reales (`alta|media|baja`, default `media`,
  `PRIORIDADES`/`etiquetaPrioridad` de `labels.ts`) en vez de las etiquetas mock en mayúscula. El
  bloque "Adjuntos (demostración)" (que solo agregaba nombres falsos) se reemplazó por un input de
  archivo real de selección múltiple (`<input type="file" multiple>` oculto, disparado por un
  botón, con chips removibles antes de enviar), mandado en el mismo `POST /publico/tickets` junto
  con el resto del formulario. La pantalla de confirmación muestra el `numero` real (`TK-xxxx`)
  devuelto por el backend — nunca un id interno, que el backend ni siquiera entrega.
- `src/routes/mesa-de-ayuda/seguimiento.tsx` — reescrita: dos pasos reales. Buscar
  (`numero`+`email`+captcha placeholder → `POST /publico/tickets/seguimiento`; éxito guarda el
  token de portal y muestra el detalle, error muestra el mensaje genérico real del backend
  ("No pudimos validar esos datos") tal cual, sin distinguir causa) y Detalle
  (`GET /publico/ticket` con el token guardado; responder como cliente vía
  `POST /publico/ticket/mensajes` con adjuntos opcionales, refrescando el detalle después; un 401
  en cualquier momento limpia el token guardado y vuelve al formulario con un mensaje claro). Se
  agregó una sección "¿Tienes otra evidencia para adjuntar?" (`POST /publico/adjuntos`, ver decisión
  abajo). `EstadoTicketBadge` (`TicketBadges.tsx`) y `formatoFecha` (`mock-data.ts`) se reutilizan
  tal cual pide el enunciado, con un cast explícito y comentado (`as EstadoTicketMock`) donde
  `etiquetaEstadoTicket()` produce exactamente los mismos literales españoles que ya espera ese
  componente tipado al mock.

Fuera de alcance, sin tocar: `RouteGuard.tsx` (ya eximía `/mesa-de-ayuda*` desde la Fase 0),
`AppShell.tsx` (el portal sigue sin usarlo, confirmado que ya se auto-excluye por `pathname`),
`apiClient` interno, `mock-data.ts`/`ot-store.tsx` (`crearTicket`/`responderComoCliente`/tickets
mock siguen ahí sin tocar — ya nadie los llama desde las dos rutas de esta fase, pero no se
borraron), dashboard, buscador global (Fase 6).

### Decisiones dentro del espacio permitido

- **Captcha**: `NoopCaptcha` del lado del backend acepta cualquier `captchaToken` no vacío (no hay
  proveedor real todavía). Se usa un valor fijo placeholder (`"portal-sin-captcha-real"`,
  constante en `src/lib/api/portal.ts`) en los tres envíos que lo exigen — no se montó ningún
  widget de Turnstile/hCaptcha, no es parte de esta fase ni existe del lado del backend.
- **Token de portal en `sessionStorage`**: decisión explícita del enunciado, documentada en
  `src/lib/portal/token.ts` — el portal es de cara al público, posiblemente en equipos
  compartidos, y el token expira solo en 15 minutos de todas formas.
- **Sin hooks de detalle de adjuntos en el portal**: `GET /publico/ticket` (confirmado contra
  `docs/api.md`) no expone ningún id de adjunto, ni por mensaje ni a nivel de ticket — a
  diferencia del panel interno, el DTO reducido del portal simplemente no lo trae. Por eso no hay
  ninguna lista ni botón de descarga de adjuntos en el detalle público: no hay ningún id al cual
  apuntar. `POST /publico/adjuntos` (botón "Adjuntar otro archivo") solo confirma que el archivo se
  recibió, sin listarlo después — extensión barata que se implementó igual (el enunciado la
  dejaba opcional), pero acotada a lo que el DTO realmente permite mostrar.
- **Sin descarga de adjuntos en el portal**: por la misma razón de arriba — no hay ningún id de
  adjunto disponible en ninguna respuesta pública al cual enlazar una descarga. Se verificó de
  todas formas, por el camino indirecto del panel interno, que los archivos subidos vía
  `POST /publico/tickets` (`adjuntos`) y `POST /publico/adjuntos` (`archivo`) sí llegan
  correctamente al ticket y son descargables desde ahí (ver verificación abajo).
- **Bug de hidratación encontrado y corregido durante el recorrido, fuera del alcance escrito pero
  necesario**: la primera versión de `seguimiento.tsx` leía el token de portal guardado
  (`getPortalToken()`) directo en el inicializador de `useState`, lo que corre tanto en el render
  del servidor (TanStack Start hace SSR) como en la hidratación del cliente. El servidor nunca
  tiene `sessionStorage`, así que siempre renderizaba el formulario de búsqueda; si el cliente ya
  tenía un token guardado de una visita anterior, hidrataba con el árbol del detalle del ticket —
  un mismatch real, confirmado como `Uncaught` en la consola del navegador durante la
  verificación. Se corrigió con el mismo patrón que ya usa `AuthProvider.tsx` para el JWT interno:
  arrancar en `null` (igual que el servidor) y leer `sessionStorage` recién dentro de un
  `useEffect`, después de montar. Confirmado el fix con una pestaña nueva, token ya guardado y
  navegación completa (no un `Link` interno): consola sin errores.

## Fase 5 — verificación

`npx tsc --noEmit` limpio (confirmado antes y después del fix de hidratación).

Recorrido real en navegador (backend `npm run dev` contra la BD real `siga-tickets`, frontend
`npm run dev` puerto 8080, MCP de navegador), sin sesión interna iniciada para el portal:

1. `/mesa-de-ayuda`: formulario completado con datos reales (nombre, correo, empresa, prioridad
   `Alta`, asunto, descripción) y enviado → `POST /publico/tickets` (201) → pantalla de
   confirmación mostró el número real **TK-0002**, sin ningún id interno visible. El selector de
   archivo nativo del SO no se puede automatizar desde el MCP de navegador (mismo límite ya
   documentado en las Fases 1 y 3), así que el adjunto real de creación se probó por un camino
   equivalente: `curl` contra el mismo endpoint (`POST /publico/tickets`, multipart con
   `adjuntos=@archivo`) creó un segundo ticket (**TK-0003**) con un adjunto real, confirmado luego
   en el panel interno (nombre de archivo correcto, tipo `text/plain`, botón "Descargar" funcional).
2. `/mesa-de-ayuda/seguimiento`: buscado con correo equivocado → "No pudimos validar esos datos".
   Buscado con un número inexistente (`TK-9999`) y el correo correcto → **exactamente el mismo**
   mensaje, confirmando que el frontend no intenta distinguir ni endurecer la causa. Buscado con
   `TK-0002` + correo correcto → `POST /publico/tickets/seguimiento` (200), token de portal
   guardado, detalle cargado: asunto, descripción, estado "Nuevo", fecha real, sin mensajes
   (confirmado que `GET /publico/ticket` no modela la descripción inicial como un mensaje de
   conversación — coincide con lo documentado, nada que ajustar en el frontend).
3. Respondido como cliente desde el detalle (`POST /publico/ticket/mensajes`) → tras el envío se
   refrescó el detalle automáticamente y el mensaje apareció en la conversación con autor "Tú".
4. **Verificación cruzada con el panel interno**: admin desechable nuevo por variables de entorno
   al script `seed.ts` (`SEED_ADMIN_USERNAME=qa_felipe_admin_f5`, contraseña de un solo uso
   generada con `openssl rand -hex 16`, nunca guardada en el repo) y, con su token, un usuario
   `tecnico` (`qa_felipe_tec_f5`). Con `qa_felipe_tec_f5` en `/tickets`: **TK-0002** apareció con
   canal **Portal**, prioridad **Alta**, **Sin asignar**, recepcionado por **Sistema** — todo
   coincide con `docs/api.md`. Se tomó el ticket (`POST /tickets/:id/tomar`) y se respondió como
   staff (`POST /tickets/:id/mensajes`, `respuesta_cliente`) → el mensaje del cliente del paso 3
   apareció en el hilo interno con el autor externo correcto (`juan.qa.fase5@cliente.cl`, sin
   usuario interno asociado). Sin volver a buscar en el portal (recarga de la misma URL, mismo
   token de portal todavía vigente): el detalle público mostró el estado ya recalculado a
   **Abierto** y la respuesta del staff con autor "Taller OT" — confirmando que el backend reabre/
   avanza el ticket y que el token de portal sigue sirviendo para refrescar sin volver a
   autenticarse.
5. `POST /publico/adjuntos` (botón "Adjuntar otro archivo") probado con `curl` (mismo límite del
   selector nativo) contra el token de portal vigente de TK-0002 → `201`, y el archivo apareció
   correctamente en "Adjuntos del ticket" del panel interno.
6. Token inválido: en vez de esperar los 15 minutos completos, se corrompió a mano el valor
   guardado en `sessionStorage` (`siga-ot:portal-token`) y se recargó la página → `GET
   /publico/ticket` devolvió 401, el frontend limpió el token guardado y volvió al formulario de
   búsqueda con "Tu sesión de seguimiento expiró, vuelve a consultar tu ticket." — confirmado que
   `sessionStorage` quedó realmente vacío después. No se esperó la expiración real de 15 minutos
   (no practicable dentro del tiempo de esta verificación), pero el manejo de 401 quedó probado de
   punta a punta con un token corrupto, camino idéntico en código al de un token vencido.
7. Consola del navegador revisada en ambas páginas del portal, con pestañas nuevas y navegación
   completa (no `Link` interno, para forzar SSR + hidratación real): sin errores no controlados.
   Se encontró y corrigió en el camino un mismatch de hidratación real (ver decisión arriba);
   confirmado limpio después del fix, incluido el caso que lo disparaba (token ya guardado en
   `sessionStorage` antes de una navegación completa a `/mesa-de-ayuda/seguimiento`). Los únicos
   `error` de consola vistos durante el recorrido fueron los 401/403 esperados de `AppShell.tsx`
   intentando pedir datos autenticados sin sesión (comportamiento preexistente de fases anteriores,
   no introducido por esta fase) y ruido de conexión rechazada de antes de levantar el backend.

Al terminar: `qa_felipe_tec_f5` quedó desactivado (`PATCH /usuarios/:id {activo:false}`, `200`). El
admin de prueba `qa_felipe_admin_f5` **no** se pudo desactivar a sí mismo (`409 CONFLICT`, mismo
bloqueo ya documentado desde la Fase 0); queda activo en `siga-tickets` con una contraseña de un
solo uso que no quedó en ningún archivo del repo. Los tickets de prueba (`TK-0002`, `TK-0003`) y el
archivo temporal usado como adjunto real se dejaron tal cual (no hay endpoint para borrar tickets;
el archivo temporal vivía fuera del repo, en la carpeta de scratchpad de la sesión, y se eliminó al
terminar). Backend y frontend quedaron **detenidos** al terminar — confirmado con `curl` a
`http://localhost:3002/health` y `http://localhost:8080/` (ambos sin respuesta) tras detener el
proceso real del backend por su PID (`Get-NetTCPConnection -LocalPort 3002`, `taskkill /T /F`).

## Fase 6 — qué quedó

Dashboard (`/dashboard`) y buscador global (`BuscadorGlobal()` en `AppShell.tsx`) contra
`GET /dashboard` y `GET /buscar` (`docs/api.md`, sección "Dashboard y búsqueda global (Fase 7)"),
reemplazando el 100% mock que traían ambas piezas (`useOTStore().ots/cotizaciones/sla/tickets/
slaRespuesta` en el dashboard; filtrado local de `ots`/`tickets`/`cotizaciones` del store en el
buscador). Última fase del plan — ver la nota de cierre al final de este documento.

Archivos nuevos:

- `src/lib/api/dashboard.ts` — funciones de red puras (mismo patrón que `sla.ts`): tipo `Dashboard`
  con los 10 campos exactos del contrato (comentado en el propio tipo cuáles son "foto actual" y
  cuáles "filtrado", para que quien lo use después no tenga que volver a `api.md`), `DashboardFiltros`
  (`desde`/`hasta` opcionales) y `obtenerDashboard(filtros)`.
- `src/hooks/useDashboard.ts` — `useDashboard(filtros)`, un único `useQuery` (sin mutaciones).
  `retry: false`: un `hasta` anterior a `desde` devuelve `400 VALIDATION_ERROR` real, que no se
  arregla reintentando (mismo criterio que `useTicketPublico` de la Fase 5 para su propio 401).
- `src/lib/api/buscar.ts` — funciones de red puras: tipos `ResultadoBusquedaOt`/`Ticket`/
  `Cotizacion`/`Cliente` (la forma reducida exacta de cada rama, sin reutilizar los tipos de
  `ots.ts`/`tickets.ts`/`cotizaciones.ts` — el DTO de búsqueda trae menos campos que el DTO de
  listado de cada dominio, así que son tipos propios) y `buscar(q)`.
- `src/hooks/useBuscar.ts` — `useBuscar(q)`, `enabled` exige `estaAutenticado` y al menos 2
  caracteres (mismo umbral que ya usaba el buscador mock).

Editados:

- `src/routes/dashboard.tsx` — reescrita: reemplaza el cálculo 100% local sobre el store mock por
  `useDashboard({desde,hasta})` real. Mismo layout visual que el mock (6 KPIs arriba, 4 paneles de
  gráficos `recharts` abajo, mismos `Kpi`/`Panel`/`useColores()` locales al archivo, sin rediseño).
  Los 6 KPIs del mock mapean 1 a 1 con los 6 campos numéricos reales (`otActivas`,
  `otConSlaVencido`, `montoCotizacionesAprobadas`, `tiempoMedioResolucionDias`,
  `ticketsSinResponderFueraDeSla`, `tiempoMedioPrimeraRespuestaHoras`) y los 4 paneles con los 4
  campos de arreglo (`otPorEstado`, `otPorCliente` top 10, `otPorResponsable`,
  `cotizacionesPorEstado`) — ningún KPI ni gráfico del mock quedó sin equivalente real, y no se
  agregó ninguno nuevo. `Kpi`/`Panel` ganaron una prop `fotoActual` opcional que agrega un texto
  italic ("Valor actual — no cambia con el rango de fechas.") o una píldora "Foto actual" junto al
  título, aplicada exactamente a los 6 campos que `api.md` marca como foto actual
  (`otActivas`, `otConSlaVencido`, `otPorEstado`, `otPorCliente`, `otPorResponsable`,
  `ticketsSinResponderFueraDeSla`) — los 4 filtrados no la llevan. `tiempoMedioResolucionDias`/
  `tiempoMedioPrimeraRespuestaHoras` en `null` muestran "Sin datos" en vez de `NaN`/`0.0`. Un
  `hasta` anterior a `desde` se maneja con un banner inline (`No se pudo cargar el dashboard: <mensaje
  real del backend>`), que reemplaza los KPIs/gráficos mientras dura el error, en vez de dejarlos
  con datos viejos engañosos.
- `src/components/AppShell.tsx` — `BuscadorGlobal()`: reemplaza el filtrado local (`ots`/`tickets`/
  `cotizaciones` del store, sin `clientes`) por `useBuscar(qDebounced)` real, con `useDebounced`
  (300 ms, mismo criterio que el resto de la app desde la Fase 1) sobre el texto antes de pegarle a
  `GET /buscar`. Los 4 grupos reales se muestran en el mismo orden que ya usaba el mock (Órdenes de
  trabajo, Tickets, Cotizaciones) más el grupo nuevo "Clientes" al final. Clic: OT → `abrirOT(id)`
  (igual que antes); Ticket → `abrirTicket(id)` + `navigate({to:"/tickets"})` (igual que antes);
  Cotización → `navigate({to:"/cotizaciones"})` (igual que antes, ver decisión abajo); Cliente → sin
  acción de clic (ver decisión abajo). Mientras `qDebounced` todavía no alcanza al texto ya tecleado
  (o la query está en curso) se muestra "Buscando…" en vez de "Sin resultados" para no mentir
  brevemente en cada tecla. Solo esta función se tocó del archivo — el resto de `AppShell.tsx`
  (`Notificaciones`, `ResumenInicio`, `MenuPerfil`, `SidebarContenido`, etc.) queda exactamente
  igual que en fases anteriores.

Fuera de alcance, sin tocar: `RouteGuard.tsx`, `apiClient`/`publicApiClient`, cualquier pantalla
fuera de `dashboard.tsx` y `BuscadorGlobal()`, `mock-data.ts`/`ot-store.tsx` (ver el chequeo final
de `useOTStore` más abajo — ninguno de los dos se tocó ni se borró).

### Decisiones dentro del espacio permitido

- **KPI "Resolución promedio"**: cambia de significado respecto al mock, documentado en el
  enunciado como esperable. El mock calculaba `fechaEstimada - fechaIngreso` (una estimación, ni
  siquiera la fecha real de cierre — un defecto del mock, no una elección de diseño). El campo real
  (`tiempoMedioResolucionDias`) es `terminadoEn - fechaIngreso` sobre OT realmente terminadas en el
  período: la fecha de cierre real, no una estimación. El detalle del KPI se reescribió a "OT
  terminadas en el período: desde ingreso hasta el cierre real" para no seguir insinuando que mide
  una estimación.
- **Indicador visual de "foto actual"**: se implementó en dos niveles — una línea italic bajo el
  detalle de cada KPI afectado, y una píldora "Foto actual" junto al título de cada panel de
  gráfico afectado (`Panel` ganó la prop, `Kpi` también). Se prefirió repetir el aviso en cada
  tarjeta/panel en vez de un único texto general arriba del todo: el usuario que cambia el rango de
  fechas y ve que "OT activas" no se mueve necesita el aviso pegado a esa tarjeta en el momento, no
  un texto que ya scrolleó fuera de vista.
- **Error `hasta < desde`**: se optó por un banner inline (no un toast) porque el dashboard es una
  vista de solo lectura sin otras acciones en curso — un banner fijo bajo los filtros de fecha,
  visible mientras el error persiste, comunica mejor "esto no cargó" que un toast que desaparece
  solo, y evita mostrar KPIs/gráficos con el estado anterior (potencialmente de otro rango) mientras
  el usuario no corrige la fecha.
- **Buscador — clic en "Cotización"**: se revisó `cotizaciones.tsx` (Fase 2) y su diálogo de
  detalle (`DialogoDetalleCotizacion`) solo se abre con un `id` guardado en un `useState` local al
  componente de la ruta (`detalleId`) — no hay query param, hash ni campo del store que permita
  abrirlo desde afuera sin agregar un mecanismo nuevo (que el enunciado no pide para esto). Se
  navega a `/cotizaciones` sin abrir el detalle, igual que ya hacía el buscador mock.
- **Buscador — clic en "Cliente"**: se confirmó (grep sobre `src/routes/`) que no existe ninguna
  pantalla de detalle de cliente en la app — `clientes` solo se usa como selector (`useClientes()`)
  en formularios y filtros, nunca como una ruta propia. Se optó por la opción más simple del
  enunciado: mostrar el resultado (nombre del cliente) sin acción de clic, en vez de inventar una
  navegación a `/cotizaciones`/`/todas-las-ot` "filtrado por cliente" que habría exigido además
  sincronizar el filtro de esa pantalla desde afuera (ninguna de las dos expone hoy un mecanismo
  para eso, mismo problema que el punto anterior). La fila se renderiza como texto plano (sin
  `<button>`, sin estado hover) para que visualmente no invite a hacer clic.
- **`useBuscar`/`useDashboard` sin invalidación cruzada**: ninguno de los dos hooks invalida ni es
  invalidado por otras claves de TanStack Query — son vistas agregadas de solo lectura, no hay
  ninguna mutación en esta fase que deba refrescarlos, y forzar un refetch de `/dashboard` o
  `/buscar` desde mutaciones de otros dominios (crear una OT, cambiar un estado, etc.) habría sido
  invalidar por especulación, no por una necesidad observada.

## Fase 6 — verificación

`npx tsc --noEmit` limpio.

Recorrido real en navegador (backend `npm run dev` contra la BD real `siga-tickets`, frontend
`npm run dev` puerto 8080, MCP de navegador):

1. Admin desechable: se generaron tres cuentas en esta fase por errores de tooling al extraer el
   token de red (rutas `/tmp` de Git Bash no resueltas por Node nativo de Windows) —
   `qa_felipe_admin_f6` y `qa_felipe_admin_f6b` quedaron creadas pero sin usarse (sus contraseñas de
   un solo uso se generaron, se usaron una vez para el intento de login fallido por el bug de
   tooling, y se descartaron sin quedar en ningún archivo ni en la salida de ningún comando). La
   cuenta efectivamente usada fue `qa_felipe_admin_f6c` (`SEED_ADMIN_USERNAME=qa_felipe_admin_f6c`,
   contraseña de un solo uso generada con `openssl rand -hex 16`, usada solo para
   `POST /auth/login` por API y nunca impresa ni guardada). Para el recorrido en el navegador, en
   vez de escribir esa contraseña en el formulario de `/login` (que no es parte del alcance de esta
   fase), se inyectó directamente el JWT ya obtenido por ese login de API en
   `localStorage["siga-ot:token"]` — la misma clave que usa `src/lib/auth/token.ts` — y se navegó a
   `/dashboard`; `AuthProvider` lo validó contra `GET /auth/me` con normalidad. Decisión tomada para
   no manejar ninguna contraseña en texto plano dentro del navegador, dado que `login.tsx` no forma
   parte de esta fase.
2. `/dashboard` sin filtro: los 10 valores cargaron reales y no en cero (`otActivas: 3`,
   `otConSlaVencido: 0`, `montoCotizacionesAprobadas: $750.000`, `tiempoMedioResolucionDias: "Sin
   datos"` — sin OT terminadas todavía en la BD de prueba, `ticketsSinResponderFueraDeSla: 0`,
   `tiempoMedioPrimeraRespuestaHoras: "0.0 h"`), confirmados contra un `curl` directo a
   `GET /dashboard` con el mismo token (mismo JSON exacto). `otPorEstado` mostró las 6 barras (2
   `Ingresado`, 1 `En ejecución`, resto en 0), `otPorCliente` 2 clientes (`Constructora Vertiz`,
   `Minera Los Andes`), `otPorResponsable` 2 responsables, `cotizacionesPorEstado` con 1 `Borrador`
   ($425.000) y 1 `Aprobada` ($750.000) — todo dato real dejado por las Fases 1-3, ninguno mock.
3. Rango de fechas futuro (`2027-01-01` a `2027-01-31`, sin ninguna cotización real en ese rango):
   los campos **filtrados** cambiaron (`montoCotizacionesAprobadas` de `$750.000` a `$0`,
   `cotizacionesPorEstado` las 4 filas a `0 · $0`, `tiempoMedioPrimeraRespuestaHoras` de `0.0 h` a
   "Sin datos"), mientras los campos **foto actual** se mantuvieron exactamente iguales
   (`otActivas: 3`, `otConSlaVencido: 0`, `ticketsSinResponderFueraDeSla: 0`, y los tres gráficos
   `otPorEstado`/`otPorCliente`/`otPorResponsable` con las mismas barras) — confirmado también por
   `curl` directo contra el mismo rango antes de probarlo en pantalla.
4. `hasta` (`2026-09-01`) anterior a `desde` (`2026-09-20`): el banner inline mostró "No se pudo
   cargar el dashboard: Datos inválidos" (el `message` real del `400 VALIDATION_ERROR` del backend),
   y los KPIs/gráficos desaparecieron en vez de quedar con el rango anterior — confirmado también
   por `curl` directo (mismo `code`/`message`).
5. Buscador global: `OT-1041` → grupo "Órdenes de trabajo" con `OT-1041 · Mantención preventiva de
   UPS - QA Fase 1 · En ejecución`; clic → abrió el Sheet real de detalle de OT-1041 (cliente,
   responsable, cadena de responsables, SLA reales, misma pantalla que ya prueban las fases 1-4).
   `TK-0001` → grupo "Tickets" con `TK-0001 · No enciende el equipo (QA Fase 3) · Abierto`; clic →
   navegó a `/tickets` y abrió el detalle real de TK-0001 (cadena de responsables, primera
   respuesta, SLA, órdenes de trabajo vinculadas). `COT-2041` → grupo "Cotizaciones" con
   `COT-2041 · Aprobada · $750.000`; clic → navegó a `/cotizaciones` (tabla real, sin abrir el
   diálogo de detalle, ver decisión arriba). `Minera` → grupo "Clientes" con `Minera Los Andes`,
   renderizado sin botón ni hover (sin acción de clic, ver decisión arriba).
6. Caso sin resultados: `zzznoexiste` → "Sin resultados para "zzznoexiste"." en vez de un panel
   vacío sin explicación.
7. Consola del navegador (`read_console_messages`, solo errores) revisada dos veces durante el
   recorrido: el único `error` en ambas lecturas fue el `400` esperado del paso 4 (`hasta` antes de
   `desde`); sin `TypeError` ni `Uncaught` en ningún punto.
8. **Chequeo final de cierre de fases** (`grep -rn "useOTStore" src/routes src/components`): de los
   20 usos encontrados, **todos** son `abrirOT`/`abrirTicket`/`otSeleccionadaId`/`ticketAbierto`
   (navegación, legítimos) **excepto dos**, ambos ya documentados como fuera de alcance en fases
   anteriores y sin relación con esta fase:
   - `src/routes/linea-de-tiempo.tsx:82` — `const { ots, sla } = useOTStore();`: la línea de tiempo
     sigue 100% en mock, decisión explícita de la Fase 1 (`GET /ots/kanban` no trae `fechaIngreso`,
     conectarla de verdad exigía N+1 o un campo nuevo del backend — ver Fase 1 arriba).
   - `src/components/AppShell.tsx:198` — `const { ots, sla } = useOTStore();`: el badge "N con SLA
     vencido" del menú lateral (`SidebarContenido`) sigue sobre `nivelSla(ot, sla)` del store mock,
     decisión explícita de la Fase 4 (arriba).
   Ninguna pantalla de negocio nueva quedó dependiendo del store mock por esta fase — los dos
   hallazgos ya existían antes de empezar la Fase 6 y no estaban en su alcance escrito (solo
   `dashboard.tsx` y `BuscadorGlobal()`). `mock-data.ts`/`ot-store.tsx` en sí no se tocaron ni se
   borraron, tal como pide el enunciado.

Al terminar: `qa_felipe_admin_f6` y `qa_felipe_admin_f6b` (las dos cuentas generadas por el problema
de tooling del paso 1, nunca usadas para nada más que ese intento de login) quedaron desactivadas
(`PATCH /usuarios/:id {activo:false}`, ambas `200`, usando el token de `qa_felipe_admin_f6c`). El
admin efectivamente usado, `qa_felipe_admin_f6c`, **no** se pudo desactivar a sí mismo (`409
CONFLICT`, mismo bloqueo ya documentado desde la Fase 0); queda activo en `siga-tickets` con una
contraseña de un solo uso que no quedó en ningún archivo del repo ni de la sesión (el archivo
temporal que contuvo el JWT en el scratchpad de la sesión, nunca la contraseña, se borró al
terminar). Backend y frontend quedaron **detenidos** al terminar — confirmado con `curl` a
`http://localhost:3002/health` y `http://localhost:8080/` (ambos sin respuesta) tras detener el
proceso del backend por su PID (`Get-NetTCPConnection -LocalPort 3002`, `Stop-Process -Force`) y el
del preview del frontend vía la herramienta de navegador.

## Cierre del plan (7 fases)

Con la Fase 6 termina el plan completo de adaptación del frontend (Fase 0 a Fase 6, tabla al inicio
de este documento). Estado final:

- **Conectado a datos reales de punta a punta**: autenticación, OT (kanban, listado, detalle,
  derivación, colaboradores, horas, etapas, comentarios, adjuntos), cotizaciones, tickets (bandeja,
  detalle, tomar, derivar, mensajes, convertir a OT), SLA (configuración + feriados), notificaciones
  (campana + resumen de inicio), portal público de mesa de ayuda, dashboard y buscador global — las
  9 áreas de negocio del prototipo original están contra el backend real, sin datos mock en su
  lógica.
- **Dos excepciones conocidas, ambas documentadas en el momento en que se decidieron, no
  descubiertas recién ahora**: la línea de tiempo (`linea-de-tiempo.tsx`, Fase 1) y el badge "N con
  SLA vencido" del menú lateral (`AppShell.tsx`, Fase 4) siguen leyendo `ots`/`sla` del store mock
  (`ot-store.tsx`) — ambas por la misma razón de fondo: el dato que necesitan (`fechaIngreso` en el
  kanban, o un cálculo de SLA vencido por fuera del propio dashboard) no está expuesto por ningún
  endpoint existente sin pagar un costo (N+1 o un endpoint nuevo) que ninguna fase tuvo en su
  alcance escrito. Quedan como trabajo pendiente real si se quiere cerrar el 100%, no como deuda
  técnica oculta.
- **`mock-data.ts` y `ot-store.tsx` siguen existiendo tal cual**, sin que se les haya pedido nunca
  en ninguna fase que se borren — siguen siendo la fuente de las dos excepciones de arriba, además
  de los tipos/estado que ya no lee ninguna pantalla pero que tampoco se limpiaron por no ser parte
  del alcance de ninguna fase (mencionado explícitamente al cierre de cada fase que dejó algo sin
  usar ahí). Una limpieza de esos dos archivos (quitar lo que ya nadie usa, o resolver las dos
  excepciones de arriba con un cambio de backend) sería trabajo nuevo, no continuación de este plan.
- **Verificación**: las 7 fases se verificaron con `tsc --noEmit` limpio y un recorrido real en
  navegador contra el backend real (`siga-tickets`), con usuarios de prueba desechables creados y
  desactivados en cada fase (o documentado el bloqueo `409` cuando el propio admin de prueba no
  pudo autodesactivarse). Ningún backend se modificó para hacer pasar al frontend — cualquier
  comportamiento inesperado encontrado en el camino (ver "Bug encontrado y corregido" de las Fases
  1, 3, 4 y 5) se corrigió del lado del frontend o se documentó como límite real de la API.

## Fase A — configuración de correo (post-cierre del plan de 7 fases)

Trabajo nuevo, fuera de la numeración 0–6 de arriba: el backend agregó una "Fase A" propia
(`docs/api.md`, sección "Configuración de correo (Fase A)") que expone `GET`/`PUT
/correo/config` para administrar el buzón real (IMAP entrante + SMTP saliente) desde una única
fila en `configuracion_correo`, reemplazando las variables de entorno fijas que usaban
`jobs/correoSalienteJob.ts`/`jobs/ingestaCorreoJob.ts`. Esta sección cubre solo el frontend de esa
pieza: una tercera sección "Correo" en `/configuracion`, debajo de Feriados. Fuera de alcance (a
propósito, quedan para fases futuras): Departamentos, Temas de ayuda, Planes SLA, Plantillas de
correo.

Archivos nuevos:

- `src/lib/api/correoConfig.ts` — funciones de red puras (mismo patrón que `sla.ts`): tipo
  `CorreoConfig` (espejo exacto de la forma de `GET /correo/config`, con `tieneImapPassword`/
  `tieneSmtpPassword` en vez de la contraseña real, que el backend nunca devuelve), tipo
  `ActualizarCorreoConfigInput` (`Partial<Omit<CorreoConfig, "tieneImapPassword" |
  "tieneSmtpPassword" | "actualizadoEn">>` más `imapPassword`/`smtpPassword` opcionales en texto
  plano, para `PUT /correo/config`), y `obtenerCorreoConfig`/`actualizarCorreoConfig`.
- `src/hooks/useCorreoConfig.ts` — `useCorreoConfig()` (query) y `useActualizarCorreoConfig()`
  (mutation con `toast.success("Configuración de correo guardada.")`/`toast.error`, invalida
  `["correo","config"]` al guardar), mismo criterio que `useSla.ts`.

Editado:

- `src/lib/labels.ts` — se agregó `puedeEscribirCorreoConfig(rol)` (`rol === "admin"`, igual que
  `puedeEscribirSla`; función propia y no reutilizada porque protege una superficie distinta,
  mismo criterio ya usado para separar `puedeEscribirSla` de `puedeEscribirCotizaciones`). El resto
  del archivo no cambió.
- `src/routes/configuracion.tsx` — se agregó la sección "Correo" completa debajo de Feriados, sin
  tocar SLA ni Feriados. Dos bloques visuales (`BloqueCorreo`, componente local reutilizado dos
  veces: "Buzón entrante (IMAP)" y "Correo saliente (SMTP)") con host/puerto/usuario/contraseña
  (+carpeta solo en IMAP) y switches TLS/Habilitado, más dos campos generales fuera de los bloques
  (Remitente = `correoDesde`, Dominio). RBAC visual idéntico al de SLA: `puedeEscribirCorreoConfig`
  condiciona `Input`/`Switch` editables vs. texto plano + switches deshabilitados, con el mismo
  aviso "Solo un administrador puede...".

### Decisiones dentro del espacio permitido

- **Diff real contra el servidor, no el patrón de SLA**: a diferencia de `guardar()` en la sección
  SLA (que manda las 3 filas completas en cada `PUT`, porque ninguno de sus campos es secreto),
  `SeccionCorreo.guardar()` arma el body con `construirCambiosCorreo(config, borrador)`: compara
  cada campo del borrador contra el último valor cargado del servidor y solo incluye los que
  cambiaron de verdad. Es la única forma correcta de que "cambiar solo el puerto" no tenga forma de
  arrastrar un campo con un valor viejo, y es indispensable para las contraseñas: `imapPassword`/
  `smtpPassword` solo entran al body si el usuario escribió algo nuevo en el campo (que siempre
  arranca vacío), nunca por comparación contra un valor cargado — el backend nunca envía la
  contraseña real, así que no hay nada contra qué diferenciar.
- **El borrador se resetea solo al guardar, reutilizando la invalidación existente**: igual que en
  SLA, `useEffect(() => { if (config) setBorrador(aCorreoBorrador(config)) }, [config])` ya
  resincroniza el borrador cuando la mutación invalida `["correo","config"]` y llega el `GET`
  actualizado. Efecto colateral correcto y buscado: como `aCorreoBorrador` siempre pone
  `imapPassword`/`smtpPassword` en `""`, esto limpia solos los campos de contraseña recién escritos
  después de un guardado exitoso, sin código extra para "limpiar el formulario".
- **Placeholders de ejemplo por bloque, no un único texto compartido**: se encontró durante el
  recorrido de prueba (ver verificación abajo) que el bloque SMTP mostraba el placeholder de
  ejemplo de IMAP (`imap.sigaltda.cl`/`993`) por usar el mismo `CampoCorreoTexto` sin distinguir el
  bloque. Se corrigió con `const esImap = idPrefix === "imap"` dentro de `BloqueCorreo`, que elige
  `imap.sigaltda.cl`/`993` o `smtp.sigaltda.cl`/`587` (los mismos ejemplos que trae el propio
  contrato en `docs/api.md`). No afecta el contrato con el backend (son solo placeholders de un
  campo vacío), pero sí la usabilidad real del formulario.
- **`BloqueCorreo` como componente local reutilizado, no dos formularios copiados**: los bloques
  IMAP y SMTP comparten campos casi idénticos (difieren solo en "Carpeta", exclusivo de IMAP); se
  optó por un componente parametrizado (`idPrefix`, `titulo`, `carpeta?`/`onCarpeta?` opcionales)
  en vez de duplicar ~40 líneas de JSX dos veces, mismo criterio de "reuso justificado" que ya usa
  `SeccionFeriados` como componente local separado del componente principal.

## Fase A — verificación

`npx tsc --noEmit` limpio (confirmado después del fix de placeholders).

**Infraestructura, hallazgo no relacionado con el código de esta fase pero necesario para poder
probarla**: a diferencia de fases anteriores (que levantaban backend/frontend con `npm run dev`
sueltos), en esta sesión `siga-ot-backend`/`siga-ot-worker`/`siga-ot-frontend` ya corrían por
`docker compose` desde antes (contenedores de desarrollo persistentes, con `./backend/src` y
`./frontend/src` montados como volumen). Se detectó que ni `tsx watch` (backend) ni Vite (frontend)
recibían los eventos de cambio de archivo del bind mount de Docker Desktop en Windows para esta
sesión — los archivos nuevos llegaban al contenedor (confirmado con `docker exec ... grep`) pero
el proceso servía el árbol de módulos viejo (`GET /correo/config` daba `404 NOT_FOUND` pese a que
`correoConfig.routes.ts` y su wiring en `app.ts` ya existían en el commit del backend). Un
`docker restart` simple del frontend resolvió su caso; el backend además había agregado
`MAIL_CREDENTIALS_KEY` a `backend/.env` después de que el contenedor ya existía, y como
`env_file` solo se lee al crear el contenedor, un `restart` lo dejó sin esa variable y no
arrancaba (`Error: Variables de entorno inválidas: MAIL_CREDENTIALS_KEY: Required`) —
se resolvió con `docker compose up -d --no-deps --force-recreate backend worker`, que sí relee
`.env`. Ninguna causa de esto es código de esta fase; queda anotado para que la próxima fase que
edite backend o frontend contra estos mismos contenedores no pierda tiempo pensando que sus
cambios no compilan.

Recorrido real en navegador (backend/worker/frontend reales, contra la BD real `siga-tickets`,
puerto 8082, MCP de navegador):

1. Admin desechable nuevo (`qa_felipe_admin_fa`) vía `seed.ts` con `SEED_ADMIN_USERNAME`/
   `SEED_ADMIN_EMAIL`/`SEED_ADMIN_NOMBRE`/`SEED_ADMIN_PASSWORD` pasadas inline en el comando (nunca
   escritas en `backend/.env`), contraseña de un solo uso generada con `openssl rand -hex 16` y
   guardada solo en un archivo temporal del scratchpad de la sesión, borrado al terminar. Con su
   token (por `POST /auth/login`, nunca impreso) se creó un `tecnico` desechable
   (`qa_felipe_tec_fa`) vía `POST /usuarios`, mismo criterio de contraseña temporal.
2. Con `qa_felipe_admin_fa` logueado por el formulario real de `/login`: en `/configuracion`, la
   sección "Correo" cargó el estado "nunca configurado" (`GET /correo/config` con todos los campos
   en `null`/`false`, `200`, no un error). Se completaron host/puerto/usuario/contraseña ficticios
   para ambos bloques (`imap.test.sigaltda.cl:993`, `smtp.test.sigaltda.cl:587`, carpeta `INBOX`,
   remitente `Soporte QA <soporte@sigaltda.cl>`, dominio `sigaltda.cl`, ambos switches
   "Habilitado" encendidos) y se guardó → `PUT /correo/config` real `200`, toast de éxito. Se
   recargó la página por completo (no solo la query): todos los campos no-contraseña persistieron
   tal cual, y ambos campos de contraseña volvieron a mostrar el placeholder "•••••••• (ya
   configurada)" vacíos, sin rastro del valor escrito (confirmado leyendo `input.value` por JS de
   depuración, nunca por pantalla).
3. Guardado parcial: se cambió **solo** el puerto IMAP (993→995) y se guardó de nuevo. La
   respuesta del `PUT` (`200`) trajo `imapPort:995` junto con `tieneImapPassword:true` y
   `tieneSmtpPassword:true` — confirma indirectamente que el guardado parcial (que nunca mandó
   `imapPassword`/`smtpPassword`) no tocó las contraseñas ya guardadas, tal como exige
   `construirCambiosCorreo`.
4. Con `qa_felipe_tec_fa` (técnico) logueado (sesión anterior cerrada con `localStorage.clear()`
   real, no solo navegación): la sección "Correo" se mostró en texto plano (sin ningún `<input>` de
   host/puerto/usuario en el DOM, confirmado con JS de depuración — `document.getElementById(...)`
   devolvió `null` para los 11 campos de texto), los switches TLS/Habilitado presentes pero
   `disabled`, los datos del paso 2/3 visibles tal cual (incluida la contraseña como "ya
   configurada"), el aviso de solo lectura visible, y sin botones "Guardar"/"Descartar" — mismo
   patrón que SLA.
5. Consola del navegador (`read_console_messages`, solo errores): un único `404` (residuo del
   momento en que el backend todavía no había recargado la ruta, antes del `force-recreate` del
   punto de infraestructura arriba) y tres `403` de `GET /usuarios` para el técnico (mismo límite
   admin-only ya documentado desde la Fase 1, no una regresión de esta fase). Ningún `TypeError` ni
   `Uncaught` en ningún punto del recorrido.

Al terminar: `qa_felipe_tec_fa` quedó desactivado (`PATCH /usuarios/:id {activo:false}`, `200`). El
admin de prueba `qa_felipe_admin_fa` **no** se pudo desactivar a sí mismo (`409 CONFLICT`, mismo
bloqueo ya documentado desde la Fase 0); queda activo en `siga-tickets` con una contraseña que no
quedó en ningún archivo del repo ni de la sesión. La fila de prueba de `configuracion_correo`
(host/usuario/contraseñas ficticias de los pasos 2–3) se borró de la BD real al terminar (`DELETE
FROM configuracion_correo` vía un script desechable de una sola corrida, nunca commiteado); `GET
/correo/config` quedó de nuevo en el estado "nunca configurado". A diferencia de fases anteriores,
backend/worker/frontend **no** se detuvieron al terminar: ya corrían por `docker compose` como
entorno de desarrollo persistente antes de empezar esta verificación (no los levantó esta sesión),
así que se dejaron **corriendo** en el mismo estado en que se encontraron — confirmado con
`curl http://localhost:3002/health` (`200`) y `http://localhost:8082/` (`200`) después de la
limpieza.

## Fase B — catálogos de configuración y tema de ayuda (post-cierre del plan de 7 fases)

Trabajo nuevo, fuera de la numeración 0–6: el backend agregó cuatro catálogos administrables
(`docs/api.md`, secciones "Departamentos (Fase B1)", "Temas de ayuda (Fase B1)", "Planes SLA (Fase
B2)", "Plantillas de correo (Fase B2)") más un campo `temaAyudaId` opcional en `POST /tickets`
(`temaAyuda` embebido en `GET /tickets/:id`). Esta sección cubre el frontend completo: cuatro
secciones nuevas en `/configuracion` y el selector opcional de tema de ayuda en "Nuevo ticket" +
su lectura en el detalle del ticket.

Archivos nuevos:

- `src/lib/api/departamentos.ts`, `src/lib/api/temasAyuda.ts`, `src/lib/api/planesSla.ts`,
  `src/lib/api/plantillasCorreo.ts` — funciones de red puras, un archivo por catálogo, mismo
  patrón que `sla.ts`/`correoConfig.ts`. `temasAyuda.ts` reexporta el tipo `Prioridad` de
  `labels.ts` para `prioridadSugerida`; `planesSla.ts` reutiliza los mismos 5 campos de
  configuración que `SlaConfigFila` pero como un tipo propio (`PlanSla`, con `id`/`nombre`/
  `creadoEn`/`actualizadoEn`, sin relación de tipos con `sla.ts` — son catálogos distintos, aunque
  compartan forma). `plantillasCorreo.ts` agrega `PLACEHOLDERS_PLANTILLA` (mapa fijo de qué
  `{{campo}}` acepta cada una de las 3 plantillas, tomado literal de `docs/api.md`) para el texto
  de ayuda del formulario.
- `src/hooks/useDepartamentos.ts`, `src/hooks/useTemasAyuda.ts`, `src/hooks/usePlanesSla.ts`,
  `src/hooks/usePlantillasCorreo.ts` — un hook de TanStack Query por operación, mismo criterio que
  `useSla.ts`/`useCorreoConfig.ts`. Ningún catálogo nuevo invalida `["ots"]`/`["tickets"]`: a
  diferencia de `useActualizarSlaConfig`, nada de esta fase recalcula SLA ni afecta datos ya
  embebidos en OT/ticket (Planes SLA es un catálogo sin conexión real todavía; Temas de ayuda solo
  se lee al crear un ticket, no se recalcula nada al editarlo).
- `src/components/configuracion/SeccionDepartamentos.tsx`,
  `src/components/configuracion/SeccionTemasAyuda.tsx`,
  `src/components/configuracion/SeccionPlanesSla.tsx`,
  `src/components/configuracion/SeccionPlantillasCorreo.tsx` — a diferencia de Feriados/Correo
  (Fase A, componentes locales dentro de `configuracion.tsx`), estas 4 secciones se dividieron en
  archivos propios bajo `src/components/configuracion/`: con SLA + Feriados + Correo ya en el
  archivo, sumar 4 secciones más (una de ellas, Temas de ayuda, con un formulario de crear/editar
  compartido) habría dejado `configuracion.tsx` por encima de 1300 líneas. Se dividió para las 4 a
  la vez (ninguna a medias), mismo criterio de consistencia pedido.

Editado:

- `src/lib/labels.ts` — se agregaron `puedeEscribirDepartamentos`, `puedeEscribirTemasAyuda`,
  `puedeEscribirPlanesSla`, `puedeEscribirPlantillasCorreo` (los 4 `rol === "admin"`, igual que
  `puedeEscribirSla`/`puedeEscribirCorreoConfig`); una función propia por superficie en vez de
  reutilizar una sola, mismo criterio ya documentado en Fase 3/Fase A para no acoplar superficies
  que hoy comparten condición pero podrían divergir. El resto del archivo no cambió.
- `src/routes/configuracion.tsx` — se agregaron los `import` de las 4 secciones nuevas y sus 4
  bloques (encabezado con ícono + `<SeccionX puedeEscribir={...}>`) debajo de "Correo", sin tocar
  SLA/Feriados/Correo. Mismo patrón visual (tarjeta + tabla + formulario inline) que el resto del
  archivo.
- `src/lib/api/tickets.ts` — se agregó `TemaAyudaRefTicket` (`{id,nombre}|null`), el campo
  `temaAyuda` en `TicketDetalle` y `temaAyudaId?: string` opcional en `CrearTicketInput`.
- `src/routes/nuevo-ticket.tsx` — se agregó `useTemasAyuda()` (filtrado a `activo`, mismo criterio
  que el filtro `activo && username !== "sistema"` de usuarios en fases anteriores) y un `<Select>`
  "Tema de ayuda (opcional)" en la sección "Solicitud", después de Prioridad; se manda
  `temaAyudaId` en el `POST /tickets` solo si se eligió uno. Sin autocompletado de prioridad ni
  departamento al elegir un tema (a propósito — el backend tampoco lo hace todavía).
- `src/components/TicketDetail.tsx` — se agregó el campo de solo lectura "Tema de ayuda"
  (`ticket.temaAyuda?.nombre ?? "—"`) junto a "Cliente", en la misma grilla de campos de
  clasificación. Sin edición: no existe `PATCH` de `temaAyudaId` en el backend.

### Decisiones dentro del espacio permitido

- **Confirmación de borrado en Planes SLA**: no había ningún patrón de confirmación ya establecido
  en el proyecto (se revisó `configuracion.tsx` completo — "Eliminar feriado" no confirma nada) ni
  un componente `AlertDialog` en uso (existe el archivo base de shadcn, pero ningún componente lo
  importaba). Se usó `window.confirm()` — el camino más simple, sin inventar un patrón de diálogo
  nuevo para un único botón.
- **Departamento/prioridad sugerida en el formulario de Temas de ayuda**: como ambos campos
  aceptan `null` para desasignar (`docs/api.md`) y Radix `<Select>` no admite `value=""` en un
  `<SelectItem>`, se usó el mismo criterio de sentinel que ya usa el filtro `TODOS` de
  `src/routes/tickets.tsx` (`SIN_DEPARTAMENTO`/`SIN_PRIORIDAD`, valores internos que nunca
  colisionan con un uuid real ni con los 3 valores de `Prioridad`).
- **Planes SLA: fila siempre de solo lectura salvo "Editar"**: a diferencia de la tabla de SLA por
  prioridad (Fase 4, 3 filas fijas, siempre editable si `puedeEscribir`), acá el número de filas es
  variable y create/editar/eliminar conviven en la misma tabla — se optó por que cada fila entre en
  modo edición solo al pulsar el lápiz (estado local `editando` en `FilaPlan`, componente por fila),
  para no tener N formularios simultáneos abiertos. El toggle "Activo" queda siempre disponible sin
  entrar a edición (mismo criterio que Departamentos/Temas de ayuda).
- **Plantillas de correo: sin editor WYSIWYG**: el enunciado ya lo dejaba explícito (el contenido
  real ES el HTML con placeholders) — un `<Textarea>` de texto plano por plantilla, con una
  representación `<pre>` de solo lectura para roles sin permiso de escritura.

## Fase B — verificación

`npx tsc --noEmit` limpio.

**Nota de infraestructura de esta verificación**: el backend/frontend persistentes de `docker
compose` (puertos 3002/8082, ya corriendo desde la Fase A) resultaron estar sirviendo una imagen
**anterior** a los routers de Fase B (`404 NOT_FOUND` real en `GET /api/v1/departamentos` contra
ese backend, confirmado con `curl`) — el volumen montado no recargó esos archivos nuevos a tiempo
para esta sesión. Sin privilegios para reiniciar contenedores de este entorno (bloqueado por el
clasificador de modo automático), se levantó un backend propio (`npm run dev`, puerto **3005**) y
un frontend propio (`vite dev --port 8083`, con `VITE_API_URL` apuntado a `3005` solo mientras
duró la verificación) para probar el código real contra la BD real `siga-tickets`, sin tocar los
contenedores. `frontend/.env.local` y ambos `.claude/launch.json` quedaron **revertidos** a su
contenido original al terminar (confirmado con `git status`, sin diff fuera de los archivos de la
fase). Recomendación para quien retome: los contenedores `siga-ot-backend`/`siga-ot-worker`
necesitan un `docker compose restart backend worker` (o rebuild) para servir las rutas de Fase B —
no es un problema del código de esta fase.

Recorrido real en navegador (backend propio puerto 3005 contra la BD real `siga-tickets`, frontend
propio puerto 8083, MCP de navegador):

1. Admin desechable nuevo vía `seed.ts` (`SEED_ADMIN_USERNAME=qa_felipe_admin_fb`, contraseña de
   un solo uso generada con `openssl rand -hex 16`, nunca impresa en ningún archivo del repo) y,
   con su token, un usuario `tecnico` real vía `POST /usuarios` (`qa_felipe_tec_fb`).
2. Con `qa_felipe_admin_fb`: en `/configuracion`, se creó el departamento "Ventas QA"
   (`POST /departamentos`, 201) y, con él, el tema de ayuda "Consulta de ventas QA"
   (`POST /temas-ayuda` sin departamento/prioridad primero, luego editado con
   `PATCH /temas-ayuda/:id` para fijar `departamentoId`/`prioridadSugerida: "alta"` — confirmado en
   la respuesta de red que ambos quedaron seteados). Se creó un plan SLA ("Plan QA Prueba",
   `POST /sla/planes`, 201) y se eliminó (`DELETE /sla/planes/:id`, 200 — la tabla volvió a "Sin
   planes SLA registrados", confirmando que desaparece).
3. Se personalizó la plantilla `aviso_soporte` (antes `personalizada:false`) con un asunto/cuerpo
   de prueba → `PUT /correo/plantillas/aviso_soporte` (200) devolvió `personalizada:true`,
   confirmando que el indicador cambia.
4. En "Nuevo ticket": el selector "Tema de ayuda (opcional)" listó "Consulta de ventas QA" (recién
   creado) y "Falla de hardware" (preexistente). Se creó el ticket TK-0006 con el tema elegido →
   `POST /tickets` (201) devolvió `temaAyuda: {id, nombre: "Consulta de ventas QA"}`; abierto el
   detalle desde la bandeja, el campo "Tema de ayuda" lo mostró correctamente.
5. Con `qa_felipe_tec_fb` (técnico): las 4 secciones nuevas mostraron el aviso "Solo un
   administrador puede…" y quedaron en solo lectura (sin `Input`/`Select`/botones de
   crear-editar-eliminar; "Activo" sin switch interactivo) — confirmado con `get_page_text`.
6. Consola del navegador revisada con `read_console_messages`: sin `TypeError` ni `Uncaught` en
   ningún punto del recorrido; los únicos `error` fueron los `404` del backend viejo (paso previo a
   levantar el backend propio en 3005, antes de la nota de infraestructura) y los `403` esperados
   de RBAC del backend (`GET /usuarios` admin-only, ya documentado desde la Fase 0).
7. **Hallazgo de la herramienta de navegador (no del código)**: el `confirm()` nativo del botón
   "Eliminar" de Planes SLA queda suprimido por el navegador automatizado de esta sesión (siempre
   devuelve `false`), así que el flujo de borrado con confirmación real se verificó sobreescribiendo
   `window.confirm` a `() => true` solo para esta sesión de prueba (no es un cambio de código) y
   confirmando el `DELETE` real contra el backend.

Al terminar: `qa_felipe_tec_fb` quedó desactivado (`PATCH /usuarios/:id {activo:false}`, `200`). El
admin de prueba `qa_felipe_admin_fb` **no** se pudo desactivar a sí mismo (`409 CONFLICT`, mismo
bloqueo ya documentado desde la Fase 0); queda activo en `siga-tickets` con una contraseña de un
solo uso que no quedó en ningún archivo del repo. Datos de catálogo dejados en `siga-tickets`:
el departamento "Ventas QA" y el tema "Consulta de ventas QA" quedaron **desactivados**
(`activo:false`, mismo criterio que el resto del catálogo — no hay `DELETE` para ninguno de los
dos) en vez de borrados; el ticket TK-0006 se dejó tal cual (no hay `DELETE` de tickets, mismo
criterio que fases anteriores); la plantilla `aviso_soporte` se restauró al texto fijo original
(`PUT` con el mismo `asunto`/`cuerpoHtml` que `TEXTO_FIJO_PARA_MOSTRAR` en
`plantillaCorreo.service.ts`), aunque queda `personalizada:true` de forma permanente porque el
contrato no tiene un `DELETE` que revierta esa bandera. Backend/frontend propios de esta
verificación (puertos 3005/8083) quedaron **detenidos**; el `docker compose` persistente
(3002/8082) se dejó exactamente como se encontró (corriendo, con el código de antes de Fase B —
ver nota de infraestructura arriba).

## Fase E2 — directorio de clientes (post-cierre del plan de 7 fases)

Trabajo nuevo, fuera de la numeración 0–6: el backend de Clientes (`docs/api.md`, sección
"Clientes") ya estaba completo desde la Fase 0 (`GET/POST/PATCH /clientes`), pero el frontend solo
tenía lectura (`obtenerClientes`/`useClientes`, usados por varios selectores). Esta fase agrega la
pantalla de administración que se había descartado explícitamente al inicio del proyecto: un
directorio simple (nombre + activo), sin historial de OT/tickets/cotizaciones por cliente.

Archivo nuevo:

- `src/routes/clientes.tsx` — ruta `/clientes`: tabla (nombre, activo) + formulario de creación +
  toggle activo/inactivo por fila. Mismo patrón exacto que
  `src/components/configuracion/SeccionDepartamentos.tsx` (Fase B1): sin `DELETE` (no existe en el
  backend), RBAC admin-only para escribir vía `puedeEscribirClientes`, lectura para cualquier rol
  autenticado. A diferencia de Departamentos (una sección dentro de `/configuracion`), Clientes es
  una ruta de nivel superior con su propio ítem de navegación — se decidió así porque el pedido
  original ("agregar el directorio de clientes") lo trata como una pantalla propia, no como una
  subsección de configuración, y clientes es una entidad de negocio de primer nivel (aparece en
  OT/tickets/cotizaciones), no un catálogo de soporte como departamentos o temas de ayuda.

Editado:

- `src/lib/api/clientes.ts` — se agregaron `crearCliente`/`CrearClienteInput` y
  `actualizarCliente`/`ActualizarClienteInput` (mismo patrón que `departamentos.ts`: `POST`/`PATCH`
  con los mismos dos campos, `nombre?`/`activo?`). `obtenerClientes`/`Cliente` (Fase 0) no
  cambiaron.
- `src/hooks/useClientes.ts` — se agregaron `useCrearCliente`/`useActualizarCliente` (mutaciones de
  TanStack Query, mismo criterio que `useDepartamentos.ts`: invalidan `["clientes"]` en
  `onSuccess`, `toast.error` en `onError`). `useClientes()` (Fase 0) no cambió de comportamiento,
  solo se movió a usar `api.obtenerClientes` con el resto de los imports del archivo.
- `src/lib/labels.ts` — se agregó `puedeEscribirClientes(rol)` (`rol === "admin"`, mismo criterio
  que `puedeEscribirDepartamentos`), función propia en vez de reutilizar otra, mismo criterio ya
  documentado en fases anteriores para no acoplar superficies que hoy comparten condición.
- `src/components/AppShell.tsx` — se agregó el ítem "Clientes" al array `nav` (entre "Cotizaciones"
  y "Configuración") con el ícono `Building2` de `lucide-react` (no usado antes en `nav`; ya
  aparecía como ícono de sección "Departamentos" en `configuracion.tsx`, mismo significado
  visual — "entidad tipo empresa"). Sin otros cambios en el archivo.

### Decisiones dentro del espacio permitido

- **Sin conteo de OT por cliente**: el enunciado lo dejaba opcional ("si te sobra tiempo y es
  simple"). Contar `GET /ots?clienteId=X` por cada fila de la tabla es una llamada por cliente
  (N+1 desde el frontend, sin un endpoint agregado que devuelva el conteo por cliente en un solo
  viaje) — se decidió no hacerlo: un directorio simple de nombre + activo ya cumple el pedido
  original ("agregar el directorio de clientes"), y agregar N+1 llamadas por una cifra decorativa
  no vale la complejidad ni el costo en el backend real.
- **Ruta de nivel superior, no sección de `/configuracion`**: ver el archivo nuevo arriba.

## Fase E2 — verificación

`npx tsc --noEmit` limpio.

**Nota de infraestructura de esta verificación**: el puerto configurado en `.claude/launch.json`
para el backend (3002) y el 8080 que usa internamente el panel de navegador de esta sesión estaban
ocupados por el forwarding de un contenedor Docker de otro proyecto del usuario (`siga-log-monitor`,
ajeno a `siga-ot`), lo que bloqueó `preview_start`. Se levantó un backend propio (`npm run dev`,
`PORT=3011`) y un frontend propio (`vite dev --port 3012`, con `VITE_API_URL` apuntado a `3011`
solo mientras duró la verificación) contra la BD real, sin tocar el contenedor ajeno ni el resto
del entorno. `.claude/launch.json` se tocó brevemente (se probó `autoPort: true`, sin efecto en el
problema real) y quedó **revertido** a su contenido original al terminar.

Recorrido real en navegador (backend propio puerto 3011, frontend propio puerto 3012, MCP de
navegador):

1. Con el admin seed existente (`admin`), se crearon dos usuarios desechables vía `POST /usuarios`:
   `e2_admin_temp` (rol `admin`) y `e2_tecnico_temp` (rol `tecnico`) — nunca se reutilizaron
   credenciales de fases anteriores para el recorrido en sí.
2. Con `e2_admin_temp`: entró a `/clientes` desde el nuevo ítem del menú, creó "Cliente Prueba E2"
   (`POST /clientes`, 201) y confirmó que aparece en la tabla. Confirmó también que el mismo cliente
   aparece en el selector de "Nuevo ticket" (`useClientes()` compartido) primero tras una recarga
   completa, y después creó un segundo cliente ("Cliente Prueba E2 SPA") y navegó por rutas internas
   (`Link` de TanStack Router, sin recarga de página) hasta "Nuevo ticket": el cliente recién creado
   ya aparecía en el selector sin recargar, confirmando que la invalidación de
   `queryKey: ["clientes"]` propaga a cualquier componente montado que use el hook. Desactivó ambos
   clientes de prueba (`PATCH /clientes/:id {activo:false}`, 200) desde la tabla.
3. Con `e2_tecnico_temp`: en `/clientes` vio el aviso "Solo un administrador puede…", la tabla en
   solo lectura (sin formulario "Agregar cliente") y los switches "Activo" deshabilitados — se
   intentó hacer clic en uno igual y no se disparó ningún `PATCH /clientes/:id` (confirmado con
   `read_network_requests`), o sea que el bloqueo es real y no solo visual.
4. Consola del navegador revisada con `read_console_messages`: sin `TypeError` ni `Uncaught` en
   todo el recorrido. **Hallazgo fuera de esta fase**: apenas inicia sesión cualquier rol no-admin,
   aparecen `403 Forbidden` en `GET /usuarios` — bug preexistente de la Fase 0
   (`src/hooks/useUsuarios.ts` solo depende de `estaAutenticado`, no del rol, y
   `UsuariosYClientesReales` en `AppShell.tsx` lo llama siempre que hay sesión) sin relación con
   Clientes; se dejó una sugerencia de tarea aparte para corregirlo, no se tocó en esta fase.

Al terminar: `e2_admin_temp` y `e2_tecnico_temp` quedaron desactivados
(`PATCH /usuarios/:id {activo:false}`, `200`) en `siga-tickets`. Los dos clientes de prueba
("Cliente Prueba E2", "Cliente Prueba E2 SPA") quedaron **desactivados** (no hay `DELETE` para
clientes) en vez de renombrados, porque el nombre ya deja claro que son de prueba y desactivado
alcanza para que no aparezcan como opción activa en ningún selector nuevo. Backend/frontend propios
de esta verificación (puertos 3011/3012) quedaron **detenidos**; ningún otro servicio del entorno
se tocó.
