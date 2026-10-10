# Deploy GitHub → Render → Neon

The root `render.yaml` creates:

| Service | Type / plan | Build command | Start / publish | Health |
| --- | --- | --- | --- | --- |
| `usmle-web` | React static site | `npm ci --include=dev && npm run build -w @usmle/shared && npm run build -w @usmle/web` | `apps/web/dist` | Open `/` and a nested route |
| `usmle-bff` | Node web service / free | `npm ci --include=dev && npm run build -w @usmle/shared && npm run build -w @usmle/bff` | `npm run start -w @usmle/bff` | `/ready` |
| `usmle-api` | Node web service / free | `npm ci --include=dev && npm run build -w @usmle/shared && npm run build -w @usmle/api && npm run db:migrate` | `npm run start -w @usmle/api` | `/ready` |

Keep **Root Directory empty** for all three services: npm workspaces, the lockfile, and shared types live at the repository root. Both Node servers already listen on `0.0.0.0` and Render's `PORT`; leave local `API_PORT`/`BFF_PORT` unset on Render.

The browser uses the BFF's public HTTPS origin. The BFF calls the API's public HTTPS origin and attaches `x-api-key`. `/api` routes require this key; content writes also require the separate admin key. Database access stays in the API. Free services cannot receive private-network requests, so this Blueprint uses public URLs. [Render free-plan documentation](https://render.com/docs/free).

## 1. Prepare GitHub and Neon

1. Push the repository, `package-lock.json`, `render.yaml`, and committed Prisma migrations to GitHub. Keep `.env` and generated/build files ignored.
2. Create a Neon project/database or choose the intended existing database. Select a region near the Render services.
3. Copy the **pooled** connection URL for runtime `DATABASE_URL`, and the **direct** URL for migration `DIRECT_URL`. Keep Neon's TLS parameters; do not remove `sslmode=require` or replace real URLs with placeholders. This application's Prisma 7 runtime uses `@prisma/adapter-pg`; its CLI datasource reads `DIRECT_URL` from `apps/api/prisma.config.ts`. [Neon Prisma guide](https://github.com/neondatabase/website/blob/main/content/docs/guides/prisma.md).
4. Run `npm ci` and `npm run check` locally before deploying.

## 2. Create the Render Blueprint

1. In Render, select **New → Blueprint**, connect GitHub, select this repository/branch, and use the root `render.yaml`.
2. Confirm the Blueprint branch is `main`. Each service sets `branch: main` and `autoDeployTrigger: checksPass`; connect the repository through Render's GitHub integration and verify Auto-Deploy is **After CI Checks Pass**. See [CI/CD workflow](ci-cd.md) for GitHub branch rules and the release process.
3. Review the resources: two **Free** Node web services and one static site, with no Render database or paid private service.
4. Supply the prompted values:

| Service | Variable | Value |
| --- | --- | --- |
| API | `DATABASE_URL` | Neon pooled URL |
| API | `DIRECT_URL` | Neon direct URL |
| BFF | `WEB_ORIGIN` | Exact React HTTPS origin, without a trailing slash or path |

If the static-site URL is not known yet, enter `https://pending.invalid` for `WEB_ORIGIN`. After provisioning, replace it with the actual static-site origin and redeploy the BFF. The placeholder allows startup but intentionally rejects browser requests until corrected. Do not guess that an assigned URL always matches a service name.

Render generates `API_KEY` and `API_ADMIN_KEY` on the API. The BFF's `API_KEY` references the API's key. `API_BASE_URL` references the API's `RENDER_EXTERNAL_URL`, and web `VITE_BFF_URL` references the BFF's `RENDER_EXTERNAL_URL`. Verify these references resolve to the assigned HTTPS origins on first sync. References refresh on Blueprint sync; `sync: false` values must be updated manually after initial creation. [Blueprint environment reference](https://render.com/docs/blueprint-spec).

Never put database URLs or service/admin keys in `VITE_` variables or on the static site. The BFF needs only its service key, API origin, allowed browser origin, and timeout; it needs no database URL or admin key.

## 3. Migrate, seed, and verify

The API build generates Prisma Client, compiles the server, then runs `prisma migrate deploy` through `npm run db:migrate`. A migration failure stops deployment. Free services do not support pre-deploy commands, so the migration runs in the build step. Migrations can affect the currently running version before replacement: use backward-compatible migrations. [Render deployment commands](https://render.com/docs/deploys).

Seed once from your trusted local environment; free services do not provide a Render shell. Set the ignored root `.env` to the intended Neon database, then run:

```bash
npm run db:seed
```

The seed is idempotent and creates fictional questions without fabricated learner activity. It is not part of each deployment. Confirm that both local and Render URLs target the same database/branch.

Once the API is healthy, deploy/verify the BFF, then the static site. Use the actual assigned URLs:

```bash
HEALTH_WEB_URL=https://YOUR-WEB.onrender.com \
HEALTH_BFF_URL=https://YOUR-BFF.onrender.com \
HEALTH_API_URL=https://YOUR-API.onrender.com \
npm run health:db
```

This command performs only read-only HTML, liveness, readiness, and catalog checks. API `/ready` checks database access; BFF `/ready` checks the API and must report `storage: postgresql`. Both expose `/health` for process liveness. Health endpoints return no credentials.

Open React, submit a question, save a bookmark, refresh, and verify history, explanations, dashboard, and performance. Open `/subjects` directly to check the `/* → /index.html` SPA rewrite. No static-site start command is needed.

## CORS and custom domains

The BFF permits only the exact `WEB_ORIGIN`; keep it aligned with the URL in the browser, including `https://`, with no trailing slash. It accepts `Content-Type` and `x-session-id`, exposes pagination headers, and rejects other origins. The API has no browser CORS setup because browser traffic goes through the BFF.

For a custom React domain, update BFF `WEB_ORIGIN` and redeploy it. For a custom BFF domain, replace the web service's `VITE_BFF_URL` reference in the Blueprint with an explicit HTTPS `value` and rebuild the static site. Similarly, an explicit API domain can replace the BFF's `API_BASE_URL` reference. Vite variables are embedded at build time. Avoid dashboard overrides that a later Blueprint sync would overwrite.

## Free-plan behavior and troubleshooting

Free web services sleep after 15 minutes of idle traffic and can take about a minute to resume. Warm the API first by opening `/ready`, then the BFF `/ready`, before testing the application. The BFF's eight-second deadline and browser's twelve-second deadline remain bounded; a cold service can cause a temporary timeout or non-JSON loading response, so retry after it wakes. [Render free-plan behavior](https://render.com/docs/free).

The two Node services share the workspace's 750 monthly free instance hours; this does not cover both running continuously for a full month. Static hosting also counts toward bandwidth/build allowances. Neon has separate account limits. This configuration selects free compute, but usage allowances still apply. [Render usage limits](https://render.com/docs/free).

- **API build fails:** verify `DIRECT_URL` and database migration permissions; retain TLS parameters.
- **API cannot start:** check `DATABASE_URL`, distinct API/admin keys, and committed migrations.
- **BFF gets 502:** confirm its public HTTPS API origin and matching service key; check API readiness/cold start.
- **Browser gets CORS errors:** update `WEB_ORIGIN` to the actual React origin and redeploy the BFF.
- **Browser calls localhost or an old BFF:** verify build-time `VITE_BFF_URL` and rebuild React.
- **Catalog is empty:** seed the same Neon database used by the API.

No Render resources have been provisioned by these file changes. Live Neon migrations, Render environment references, health checks, and deployed SPA routing require verification after you create the Blueprint.
