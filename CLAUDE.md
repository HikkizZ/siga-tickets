# siga-ot

Mesa de ayuda propia + gestión de OT y cotizaciones para SIGA Ltda (~8 usuarios). Dueño: Felipe Miranda.

- `backend/` — API Node.js + Express + TypeScript (ESModules siempre, nunca CommonJS) + TypeORM + SQL Server 2025 (`localhost:1433`, BD `siga-tickets`; tests en `siga-tickets-test`). En construcción.
- `frontend/` — React 19 + TanStack Start/Router + Tailwind v4 + shadcn/ui (plantilla exportada de Lovable, copiada desde https://pixel-perfect-canvas-6040.lovable.app). En adaptación por fases para conectarla al backend real, mismo patrón que `C:\Users\fmira\Projects\siga-log-monitor`. `npm run dev` corre en el puerto 8080.
- `docs/backend-diseno.md` — **fuente de verdad** del backend (modelo de datos, API, SLA, seguridad, plan por fases). `docs/frontend-diseno.md` — **fuente de verdad** del frontend (plan de adaptación por fases, decisiones de arquitectura). Léelos antes de tocar cada lado.
- `docker-compose.yml` (raíz) — levanta backend+worker+frontend en modo desarrollo (`docker compose up --build`) contra el SQL Server que ya corre en el host (no crea ni mueve BD; `DB_HOST` se pisa a `host.docker.internal`, el resto de credenciales sale de `backend/.env`, nunca se hornea en la imagen). Frontend en `http://localhost:8082` (mapeado así porque 8080 choca con otro contenedor en la máquina de Felipe; Vite sigue en 8080 dentro del contenedor), backend en `http://localhost:3002/api/v1`. No hay build de producción todavía: el preset de Nitro de la plantilla del frontend apunta a Cloudflare Workers por defecto, así que "producción" real necesitaría `wrangler`, no solo Docker — pendiente si algún día se decide desplegar así.

## Convenciones
- Seguir el estilo de `siga-log-monitor/backend` (capas controllers/services/entities/validations, envelope `{status, data}`, tests colocados, comentarios en español que explican el porqué) salvo donde `docs/backend-diseno.md` diga lo contrario.
- `synchronize: false` siempre; todo cambio de esquema es una migración versionada. `emitDecoratorMetadata: false` → `type` explícito en cada `@Column`.
- Timestamps `datetimeoffset(3)`; snake_case en BD. Los uuid salen en minúsculas (transformer) aunque SQL Server los devuelva en mayúsculas. Credenciales solo en `backend/.env` (ignorado por git).
- La autenticación la diseña Felipe; partir del patrón ya existente en siga-log-monitor y no inventar otro.
- Cambios quirúrgicos, sin features no pedidas. No `git push` ni borrar archivos sin confirmación.
