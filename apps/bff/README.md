# Browser-facing BFF

Architecture: **React → Express BFF → Express REST API → Neon PostgreSQL**. This workspace calls the REST API with `fetch`; it does not import Prisma/pg, use `DATABASE_URL`, or access PostgreSQL. React calls `/bff` endpoints and never receives the service key. The API remains responsible for persistence, grading, and ownership checks.

## Configuration

Run workspace commands from the repository root. The server loads the ignored root `.env` locally; injected platform values take precedence.

| Variable | Purpose |
| --- | --- |
| `API_BASE_URL` | REST API origin, such as `http://localhost:4001` or `https://api.example.com`; no `/api` suffix |
| `API_KEY` | Server-only service secret matching the REST API |
| `API_TIMEOUT_MS` | Deadline for each API call, including response-body reading; default 8000, maximum 30000 |
| `WEB_ORIGIN` | Exact allowed browser origin, default `http://localhost:5173`; no trailing slash |
| `BFF_PORT` | Local port, default 4000 |
| `PORT` | Hosting port; overrides BFF_PORT |
| `NODE_ENV` | `production` enables mandatory service configuration |

Production requires `API_BASE_URL`, `API_KEY`, and an HTTPS `WEB_ORIGIN`. Public API origins must use HTTPS. The free-plan Render Blueprint sets `API_BASE_URL` from the API's public `RENDER_EXTERNAL_URL`. For paid private services, the BFF also recognizes an explicitly configured private hostport (for example `private-api-host:10000`) and uses internal HTTP. HTTP is also supported locally. Origins containing credentials, paths, query strings, or fragments are rejected at startup. Old `API_URL`/`API_HOSTPORT` environment variables are replaced by `API_BASE_URL`.

Do not configure `API_ADMIN_KEY` or database credentials on the BFF Render service. Every upstream request uses the configured service key. Browser-provided API/admin keys, Authorization headers, cookies, and arbitrary headers are not forwarded. Content administration stays on the REST API behind its separate admin key.

## Endpoints

Learner endpoints require a UUID v4 `x-session-id`. Content reads require no session. IDs and query/body inputs are validated with Zod before making requests. The existing anonymous session model is retained; a session UUID is not account authentication. For personal records, replace it with authenticated identity established by the BFF.

| BFF endpoint | REST API call | Behavior |
| --- | --- | --- |
| GET `/bff/subjects` | GET `/api/subjects` | Paginated subjects |
| GET `/bff/subjects/:id` | GET `/api/subjects/:id` | Subject detail |
| GET `/bff/topics` | GET `/api/topics` | Paginated topics; optional subjectId |
| GET `/bff/topics/:id` | GET `/api/topics/:id` | Topic detail |
| GET `/bff/questions` | GET `/api/questions` | Question array; optional subjectId, topicId, difficulty |
| GET `/bff/questions/:id` | GET `/api/questions/:id` | Question detail |
| GET `/bff/questions/:questionId/options` | GET `/api/questions/:questionId/options` | Question options |
| GET `/bff/questions/:questionId/options/:id` | GET matching API route | Option detail |
| GET `/bff/attempts` | GET `/api/attempts` | Own history; optional questionId |
| GET `/bff/attempts/:id` | GET `/api/attempts/:id` | Own attempt |
| GET `/bff/attempts/:id/explanation` | GET matching API route | Own submitted attempt's persisted answer review |
| POST `/bff/attempts` | POST `/api/answers` | Submit and grade answer |
| GET `/bff/bookmarks` | GET `/api/bookmarks` | Own bookmarked questions |
| POST `/bff/bookmarks` | POST `/api/bookmarks` | Idempotent bookmark creation |
| DELETE `/bff/bookmarks/:id` | DELETE `/api/bookmarks/:id` | Delete own bookmark; 204 success |
| GET `/bff/progress` | GET `/api/progress` | Latest-answer progress |
| GET `/bff/dashboard` | Four concurrent API calls | Progress, performance, five recent attempts, five recent bookmarks, and total bookmark count |

List routes accept `page` (default 1, max 10000) and `limit` (default 50, max 100). API pagination envelopes are preserved; questions retain an array and `X-Total-Count`, `X-Page`, `X-Limit` response headers. Unknown or invalid query fields are rejected. Detail and mutation routes accept no query parameters.

Answer body:

```json
{
  "questionId": "10000000-0000-4000-8000-000000000001",
  "optionId": "40000000-0000-4000-8000-000000000011",
  "timeTaken": 17
}
```

`timeTaken` is a nonnegative integer in whole seconds and defaults to zero. Client-supplied correctness/user IDs are rejected. The BFF forwards the validated submission to the API and returns the grading result and explanation after submission. It does not calculate correctness.

Bookmark body: `{ "questionId": "UUID" }`. Safe content responses and bookmarked questions remove explanations and answer-key fields recursively as a second protection against accidental upstream leakage. Attempts may include their own saved correctness, and progress/performance expose aggregate metrics.

Dashboard response:

```json
{
  "progress": { "answered": 1, "correct": 1, "accuracy": 100 },
  "performance": {
    "totalAttempts": 1, "correctAttempts": 1, "questionsAnswered": 1,
    "accuracy": 100, "averageTimeTaken": 17, "bySubject": [], "byTopic": []
  },
  "recentAttempts": [],
  "bookmarks": [],
  "bookmarkCount": 0
}
```

Dashboard statistics/progress are all-time; recent lists are limited to five. All four calls use the same session. A failed component fails the dashboard and cancels unfinished calls, rather than presenting incomplete totals. The BFF validates dashboard response shapes before returning them.

`POST /bff/answers` is an answer-submission alias. The earlier `/api/questions`, `/api/answers`, and `/api/progress` BFF routes remain as compatibility aliases. React now uses `/bff`, and Vite proxies it to the BFF locally.

## Boundaries and failures

Routes use fixed upstream paths and validated UUIDs. Arbitrary URLs and content-admin writes are not proxied. Upstream redirects are rejected to prevent credentials following another origin. JSON response bodies are capped at 2 MiB, browser request bodies at 10 KiB, and each upstream call has a bounded deadline through full body consumption. All browser-facing resource responses use `Cache-Control: no-store`.

Errors use `{ "error": "Message", "code": "CODE" }`; validation errors add field `issues`. Invalid inputs return 400, oversized bodies 413, disallowed browser origins 403, and unsupported routes 404. API 400/404/409/413/422/429 statuses are preserved with generic messages. Network failures, invalid/oversized response bodies, service-auth failures, and API server errors return 502. Expired deadlines return 504. Raw upstream messages, SQL, stack traces, service keys, cookies, and internal response headers are not relayed.

CORS allows only WEB_ORIGIN and the Content-Type/x-session-id request headers. Requests with a different Origin are rejected. CORS is browser policy, not account authentication; clients without Origin can still call this anonymous demo service.

`GET /health` checks process liveness. `GET /ready` calls the REST API's readiness endpoint and returns 503 if unavailable or invalid. It reports the API's `storage` mode (`postgresql` or `memory`); Render uses this readiness endpoint for its health check. The server binds `0.0.0.0` on Render's PORT and supports SIGTERM/SIGINT with a ten-second shutdown deadline. The root Render Blueprint builds from the workspace root and supplies API_BASE_URL/API_KEY through service environment references. See [Render deployment steps](../../docs/render-deployment.md). No database migration or database environment variables are required on the BFF.

## Validation

```bash
npm run typecheck
npm test
npm run build
```

Tests cover route mapping, input validation, credential isolation, answer redaction, dashboard composition, timeout during fetch/body reading, status handling, malformed/oversized responses, and the real BFF → REST API → PostgreSQL flow. New database-backed endpoints require the API's database setup; the original practice routes still work with the API's local in-memory mode.
