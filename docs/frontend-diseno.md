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
- **Fase 1**: pendiente.

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
