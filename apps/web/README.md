# Stepwise frontend

React 19, React Router, TypeScript, Vite, and Tailwind CSS. The responsive study workspace uses a desktop sidebar, mobile navigation, keyboard-accessible controls, paginated lists, loading/error/empty states, and a shared visual system. Icons come from Lucide; fonts use the local system stack without third-party font requests.

## Run the frontend by itself

The ignored `apps/web/.env.local` enables local mock mode with:

```dotenv
VITE_USE_MOCK_DATA=true
```

For a fresh checkout, copy `apps/web/.env.example` to `apps/web/.env.local`. Install dependencies from the repository root with `npm ci`, then run:

```bash
cd apps/web
npm run dev
```

Open <http://localhost:5173>. Alternatively, run `npm run dev:web` from the root. These commands start only Vite. The root `npm run dev` is the existing full-stack launcher, so use the frontend commands above for this mode.

Mock mode provides three fictional subjects/topics/questions, sample dashboard statistics, seeded history, and a saved question. Practice feedback, bookmark edits, history review, and performance updates all work without network requests. A visible “Local demo” notice identifies sample data. Demo grading happens locally; these fictional answer keys are not production question data. Demo changes persist under `stepwise-mock-data-v1` in local storage, separate from the existing BFF session. Remove that key in browser developer tools and reload to reset samples. If storage is unavailable, changes last for the current page lifetime.

Only the exact value `true` enables mock mode. Set `VITE_USE_MOCK_DATA=false` (or remove it), restart Vite, and configure `VITE_BFF_URL` to restore the existing BFF integration. Web-local environment values override root frontend values; injected environment variables take precedence. Root server/Neon environment settings are untouched. Keep `.env.local` ignored; deployed builds default to real integration unless mock mode is explicitly enabled.

Frontend-only checks from the root:

```bash
npm run test:web
npm run typecheck -w @usmle/web
npm run build -w @usmle/web
npx eslint apps/web --max-warnings=0
```

## Pages

| Route | Page |
| --- | --- |
| `/` | Dashboard: actual activity, metrics, recent attempts, saved questions |
| `/subjects` | Subject listing; search applies to the current page |
| `/topics?subjectId=UUID` | Topic listing, optionally scoped to a subject |
| `/practice` | Question blocks; optional subjectId/topicId/difficulty/page query filters |
| `/practice/:questionId` | Practice a specific saved or historical question |
| `/explanations/:attemptId` | Review an owned attempt and its explanation |
| `/bookmarks` | Browse, practice, and remove saved questions |
| `/attempts` | Paginated attempt history with links to explanations |
| `/performance` | All-attempt statistics plus latest-answer accuracy and subject/topic breakdowns |

In BFF mode, submit an answer to unlock its explanation. Correctness comes from the API response via the BFF; the browser neither receives answer keys in question lists nor calculates grading. Questions with attempts are immutable on the API, preserving review content. History review fetches the owned attempt's explanation through `/bff/attempts/:id/explanation`, so it works after refreshing or following a direct link. The API rejects other sessions' attempt IDs.

Practice loads up to ten questions per block, supports moving to later blocks, records elapsed seconds, and makes a failed submission retryable. Bookmarks are saved on the server; the control checks prior bookmark state and handles no-content deletion responses. Refreshing restarts the visible practice block without removing recorded history. Collection pages have pagination, and subject search is explicitly limited to the loaded page.

In BFF mode, metrics use real responses, including zero/empty states; there are no invented activity charts or exam-score predictions. Performance cards and subject/topic breakdowns count every attempt. Latest-answer progress counts each unique question once. Dashboard recent lists are the five latest records supplied by the BFF.

## Connection and setup

With mock mode disabled, the browser calls **only the BFF** through `VITE_BFF_URL`. It does not call the REST API, use service/admin keys, or access PostgreSQL. The API client prefixes every route with `/bff`, sends the existing anonymous browser session UUID, and applies a twelve-second request deadline. Route loads cancel obsolete requests during navigation.

```dotenv
# Root .env — blank locally uses Vite's /bff proxy to the BFF.
VITE_BFF_URL=
# Production or standalone local preview: public BFF origin, no path suffix.
# VITE_BFF_URL=https://usmle-bff.onrender.com
```

`VITE_BFF_URL` must be an HTTP(S) origin without credentials, query strings, or a path. Vite embeds it at build time; rebuild after changes. Never put API_KEY, API_ADMIN_KEY, or database connection strings in any VITE variable. The session UUID lives in browser local storage; if storage is disabled it survives only for the current page lifetime. This is anonymous demo identity, not account authentication.

For the full-stack BFF mode, from the repository root:

```bash
npm ci
npm run env:setup
# Configure DATABASE_URL and DIRECT_URL for Neon, then:
npm run db:migrate
npm run db:seed
npm run dev
```

Open <http://localhost:5173>. Configure the BFF's WEB_ORIGIN to match the actual browser origin. Full dashboard/catalog/bookmark/history pages need the migrated and seeded database behind the API. API in-memory mode still supports practice; its database-backed pages return an error with retry rather than fabricated data. The special `/explanations/current` route supports the immediately submitted in-memory result through router state; this temporary review is lost on refresh.

## Build and hosting

```bash
npm run typecheck
npm test
npm run build
```

Publish `apps/web/dist`. Render's existing static site Blueprint rewrites all browser routes to `/index.html` for direct navigation and refreshes. It builds with the public BFF origin; the REST API URL and service key are never embedded in the frontend. Hosting configuration is provided but deployment has not been performed.

For a local production preview, build with `VITE_BFF_URL=http://localhost:4000`, start the BFF with `WEB_ORIGIN=http://localhost:4173`, and run `npm run preview -w @usmle/web`.

Frontend tests use jsdom and React Testing Library to verify subject/topic navigation, hidden feedback before submission, successful and failed submissions, bookmark removal, persisted review/ownership failures, and BFF-only request paths. Backend integration tests verify the owned explanation route through the actual BFF and API.

For end-to-end setup, health commands, automated integration coverage, and untested external steps, see [integration verification](../../docs/integration.md).
