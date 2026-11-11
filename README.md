# Delywa

Plataforma de pedidos y delivery por WhatsApp para colmados y otros negocios.
Corre completa en Cloudflare: Worker (Hono) + D1 + R2, con el frontend React servido como assets del Worker.

## Estructura

- `client/` — frontend React 19 + Vite + Tailwind 4 + shadcn/ui
- `worker/` — API (Hono) que corre en Cloudflare Workers
- `shared/` — esquema Drizzle (SQLite/D1), tipos y datos semilla
- `migrations/` — SQL de D1 (`0000_init.sql` esquema, `0001_seed.sql` datos base)
- `scripts/build-seed.ts` — regenera `0001_seed.sql` desde `shared/seed-*.ts`

## Recursos en Cloudflare

| Recurso | Nombre | Binding |
|---|---|---|
| D1 | `delywa-db` (`91ee269f-6c1b-441e-b052-19fc3a038d1b`) | `DB` |
| R2 | `delywa-uploads` | `UPLOADS` |
| Worker | `delywa` | — |

## Comandos

```bash
npm install --legacy-peer-deps   # instalar dependencias
npm run db:migrate:local         # crear la base D1 local (sandbox) con esquema y datos base
npm run dev:worker               # API en http://localhost:8787
npm run dev                      # frontend en http://localhost:5173 (proxy a la API)
npm run check                    # verificación de tipos (cliente y worker)
npm test                         # pruebas
npm run db:generate              # generar una migración nueva tras cambiar shared/schema.ts
npm run db:migrate:remote        # aplicar migraciones en la D1 real
npm run deploy                   # compilar y publicar el Worker
```

Las pruebas y el desarrollo usan solo la D1 local (`.wrangler/`), nunca la base real.
