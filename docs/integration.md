# Integration verification

The application uses React → BFF → REST API → Prisma → PostgreSQL. The BFF has no database client; database URLs and service/admin secrets stay outside the Vite environment.

## Reproduce locally

```bash
nvm use
npm ci
npm run env:setup
```

Edit the ignored root `.env`: set `DATABASE_URL` to Neon's pooled URL and `DIRECT_URL` to the direct URL, retaining TLS parameters. The setup script already supplies distinct development keys shared by the API/BFF from that file.

```bash
npm run db:migrate
npm run db:seed
npm run check
npm run dev
```

In another terminal:

```bash
npm run health:db
```

Open `http://localhost:5173`. Follow subject → topic → practice, submit an answer, save a bookmark, then refresh and check attempt history, explanations, dashboard, and performance. Remove the bookmark and confirm it disappears. The browser sends its anonymous session UUID only to the BFF; the BFF adds its service key when calling the API.

Leave `VITE_BFF_URL` blank for Vite's local `/bff` proxy. For a separate web origin, set it to the BFF origin and set `WEB_ORIGIN` to the browser origin. Restart services after environment edits; rebuild static web assets after changing Vite variables.

## Automated coverage

The integration pass completed Prisma validation, TypeScript checks, all 56 tests across seven suites, and production builds for every workspace. The local environment setup script was run twice to verify that it creates private development configuration and preserves an existing file. The health CLI was exercised against real API/BFF services in integration tests, including failure exit codes.

- TypeScript checks and production builds for all workspaces.
- Prisma schema validation, actual migration deployment/reruns and seed idempotency on embedded PostgreSQL.
- API CRUD, UUID/relationship constraints, grading, answer hiding, session ownership, statistics, and sanitized errors.
- BFF service headers, validation, deadline/body limits, dashboard composition, CORS, and error forwarding.
- React route/interaction tests and a full-stack DOM test with real BFF/API HTTP transport and Prisma persistence.
- Readiness distinguishes memory mode from PostgreSQL and propagates an unavailable database through the BFF while liveness stays available.

`npm run check` runs these checks without Neon credentials. `npm run test:integration` runs the full-stack subset. Tests use temporary localhost sockets and may require permission in restricted execution environments.

## External steps not yet verified

- Live Neon DNS, TLS, pooled/direct connections, migrations, seeds, and persistence: no Neon credentials were available during implementation. Automated database tests use PGlite rather than Neon.
- Interactive browser rendering, responsive layout, keyboard navigation, and Vite proxy behavior in a running browser: no browser preview was launched.
- GitHub Actions execution and a deployed Render Blueprint, public HTTPS service routing, platform secrets, SPA rewrites, and production health checks: configuration exists, but no deployment was performed.

The API performs a schema read before listening when `DATABASE_URL` is configured. A missing database/migration fails startup; inspect the environment and apply committed migrations rather than falling back to memory. Memory mode intentionally leaves catalog, bookmarks, history, and dashboard unavailable.
