# siga-ot backend

API Node.js + Express + TypeScript + TypeORM + SQL Server 2025. Diseño en `../docs/backend-diseno.md` (fuente de verdad).

## Puesta en marcha

```bash
# Requiere SQL Server 2025 en localhost:1433 con la base vacía `siga-tickets` (colación Modern_Spanish_CI_AS,
# insensible a mayúsculas: el esquema depende de ello; sin Full-Text).
cd backend
npm install
cp .env.example .env            # completa DB_USER / DB_PASSWORD y SEED_ADMIN_PASSWORD (el .env no se versiona)
npm run migration:run           # aplica el esquema
npm run seed                    # usuario sistema, admin, clientes y feriados 2026 (idempotente)
npm run dev                     # http://localhost:3002/health
```

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | API con recarga (tsx watch) |
| `npm run build` / `npm start` | Compila a `dist/` y arranca |
| `npm test` | Vitest + Supertest contra `siga-tickets-test` (la crea si no existe y aplica migraciones; se niega a correr contra un nombre que no termine en `-test`, nunca toca `siga-tickets`) |
| `npm run migration:run` / `migration:revert` | Aplica / revierte la última migración |
| `npm run seed` | Datos iniciales; requiere `SEED_ADMIN_PASSWORD` |
| `npx tsc --noEmit` | Chequeo de tipos |

## API

Contrato completo de los endpoints (Fases 0 y 1) en `../docs/api.md`.

## Adjuntos

Se guardan en disco bajo `ADJUNTOS_DIR` (por defecto `./storage/adjuntos`, ignorado por git y fuera de cualquier ruta servida) con el sha256 como nombre. Los tests usan `./storage/adjuntos-test` y la suite lo borra al terminar. **No hay antivirus real todavía**: `NoopAntivirus` marca todo como `limpio` y el API lo avisa en el log al arrancar (ClamAV es una fase posterior).

`synchronize` está siempre en `false`: todo cambio de esquema es una migración nueva en `src/migrations/`.

## SQL Server: notas

- **TLS**: el driver `mssql` (tedious) cifra por defecto; con el certificado autofirmado de localhost hace falta `DB_TRUST_SERVER_CERTIFICATE=true` (dev). Con un certificado válido, ponerlo en `false`.
- **uuid**: SQL Server los devuelve en MAYÚSCULAS; un transformer los normaliza a minúsculas en las entidades. En SQL crudo (`AppDataSource.query`) llegan en mayúsculas.
- **Migraciones**: un `queryRunner.query()` por sentencia (`CREATE TRIGGER` exige su propio batch); no se usa `GO`.
- **Errores**: `src/errors/dbErrors.ts` (2627/2601 único, 547 FK/CHECK, 50001 solape de `asignacion`, 50002 `evento` inmutable, 1205 deadlock). Un `THROW` dentro de un trigger deshace toda la transacción.
- Equivalencias con el PostgreSQL original: `docs/backend-diseno.md` sección 2.5.
