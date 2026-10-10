# GitHub Actions and Render CI/CD

## What runs

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`. A single required-check candidate, **Validate monorepo**, runs these steps in order:

1. Check out source with a read-only GitHub token and no persisted Git credentials.
2. Set up Node using `.nvmrc`, with npm's download cache keyed by `package-lock.json`.
3. Install the locked dependencies using `npm ci --include=dev`.
4. Generate Prisma Client and validate the committed schema.
5. Run `npm run lint` across application code, shared types, scripts, and tests.
6. Run TypeScript checks for all workspaces.
7. Run all unit and integration tests, including real React → BFF → API → Prisma → embedded PostgreSQL flows.
8. Build production artifacts for the shared package, API, BFF, and React site.

Any failed step fails the job and prevents the remaining steps from running. The job has a 20-minute timeout. A newer run cancels an older run for the same pull request or branch. There are no path filters or conditional skips on the validation job.

ESLint uses the recommended JavaScript and TypeScript rules plus React's Rules of Hooks. It ignores dependencies, build output, coverage, and generated Prisma code. Lint warnings fail CI (`--max-warnings=0`). Run `npm run lint:fix` to apply available fixes; review the changes afterward.

CI does not connect to Neon or apply production migrations. Database tests use temporary local PostgreSQL sockets and fictional seed data. No Render API token, deploy-hook URL, database credentials, or application service keys are needed as GitHub Actions secrets.

## Enable GitHub checks

1. Push this repository, its lockfile, workflow, ESLint config, and Render Blueprint to GitHub. Enable GitHub Actions for the repository if it is disabled.
2. Open a pull request and confirm **CI → Validate monorepo** runs and succeeds.
3. In GitHub Settings → Rules → Rulesets (or branch protection), protect `main`: require pull requests and the **Validate monorepo** status check before merging. Select the check after its first run, when GitHub makes it available. Keep bypass access limited to the intended maintainers.
4. If using a merge queue, add the `merge_group` event to this workflow before enabling the queue so queued commits also receive the required check.

## Enable Render auto-deployment

Each of the three services in `render.yaml` explicitly uses:

```yaml
branch: main
autoDeployTrigger: checksPass
```

Create or sync the Blueprint through your connected **GitHub integration** using [Render deployment steps](render-deployment.md). In each service's Render Settings, confirm the linked branch is `main` and Auto-Deploy is **After CI Checks Pass**. A public repository URL without a connected Git provider does not enable auto-deploy. [Render auto-deploy documentation](https://render.com/docs/deploys), [Blueprint trigger reference](https://render.com/docs/blueprint-spec).

For a new `main` commit, Render waits for the GitHub checks, then builds and deploys React, BFF, and API using their configured commands. The API build applies committed Prisma migrations against Neon; seeding stays a separate explicit local action. Render builds from source rather than downloading the CI build output. Its API/BFF readiness checks verify the services before replacement traffic is routed.

The services deploy independently, so do not rely on a particular cross-service order. Keep API contracts and migrations compatible with the currently running frontend/BFF/API during releases. Initial Blueprint creation and manual deploys can start outside the automatic CI gate; use a commit already validated by CI for initial provisioning.

Render requires at least one detected check and all detected checks to pass; it also accepts GitHub `neutral` and `skipped` conclusions. This workflow runs validation without job-level skips. Changes to other workflows can affect the deploy gate, so keep any additional required validations on `main` too. [Render CI integration](https://render.com/docs/deploys).

Keep Neon URLs and service/admin keys in Render's API environment, share only the service key with the BFF, and put only the public BFF origin in React's `VITE_BFF_URL`. Update BFF `WEB_ORIGIN` to the actual React HTTPS origin. These values and free-plan cold-start behavior are detailed in the deployment guide.

## A release from end to end

1. Make a change on a feature branch. Run `npm ci` and `npm run check` locally.
2. Open a pull request; fix failed CI steps before merging.
3. Merge into `main`. The push run validates the merged commit.
4. After the checks pass, watch all three services' Render Deploys pages and compare their deployed commit SHA with GitHub's `main` commit.
5. Warm the API and BFF if needed, then run the read-only health checks using their actual URLs:

```bash
HEALTH_WEB_URL=https://YOUR-WEB.onrender.com \
HEALTH_BFF_URL=https://YOUR-BFF.onrender.com \
HEALTH_API_URL=https://YOUR-API.onrender.com \
npm run health:db
```

6. Verify direct SPA navigation and submit a practice answer; refresh to confirm history, bookmarks, and dashboard persistence.

For failed CI, inspect the first failed Actions step and reproduce its command locally. For a green commit with no deployment, verify the connected GitHub integration, service branch, auto-deploy setting, and any other pending/failed checks. For a failed Render deploy, inspect that service's build/start logs and readiness status; use the deployment guide's environment checklist. A manual redeploy or rollback requires deliberate review, and reverting application code does not automatically reverse a database migration.

The repository configures this workflow and the deployment gate. GitHub branch rules, live Actions runs, Blueprint synchronization, actual Render auto-deployment, and Neon access still require verification in the connected accounts; these account settings have not been changed from this workspace.
