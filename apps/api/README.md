# Express REST API

All resource routes use `/api`. The free-plan Render API is a public HTTPS web service protected by service credentials. Send `x-api-key` from a trusted service client. Content mutations also require `x-admin-key`, backed by a distinct `API_ADMIN_KEY`; the BFF never forwards this key. Reads omit question explanations, answer keys, and option `isCorrect` flags, even for administrators. A successful answer submission returns grading feedback; an owned attempt can subsequently reopen it through the explanation-review endpoint.

Learner routes use a UUID v4 `x-session-id` header. They query that session's user record, not a client-supplied user ID. This preserves the anonymous demo identity model: possession of a session UUID identifies a browser session, not an authenticated account. The [BFF](../bff/README.md) now exposes browser read/learner routes under `/bff`. Add real account identity in that trusted BFF before handling personal records. Unknown fields, including client-supplied correctness or user IDs, are rejected.

## Content endpoints

| Method | Route | Input / behavior |
| --- | --- | --- |
| GET | `/api/subjects` | Paginated subjects |
| POST | `/api/subjects` | `{ "name": "Biochemistry" }` |
| GET | `/api/subjects/:id` | Subject detail |
| PUT/PATCH | `/api/subjects/:id` | `{ "name": "Updated name" }` |
| DELETE | `/api/subjects/:id` | Delete; 409 if topics remain |
| GET | `/api/topics` | Paginated; optional `subjectId` filter |
| POST | `/api/topics` | `{ "subjectId": "UUID", "name": "Enzyme kinetics" }` |
| GET | `/api/topics/:id` | Topic detail |
| PUT | `/api/topics/:id` | Both `subjectId` and `name` |
| PATCH | `/api/topics/:id` | One or both of `subjectId`, `name` |
| DELETE | `/api/topics/:id` | Delete; 409 if questions remain |
| GET | `/api/questions` | Array; optional `subjectId`, `topicId`, `difficulty` filters |
| POST | `/api/questions` | Create question and its options atomically; body below |
| GET | `/api/questions/:id` | Safe question detail |
| PUT | `/api/questions/:id` | All four metadata fields; excludes `options` |
| PATCH | `/api/questions/:id` | At least one metadata field |
| DELETE | `/api/questions/:id` | Delete options and question atomically; 409 if attempts/bookmarks exist |
| GET | `/api/questions/:questionId/options` | Safe options; no `isCorrect` |
| POST | `/api/questions/:questionId/options` | `{ "optionText": "Distractor", "isCorrect": false }` |
| PUT | `/api/questions/:questionId/options` | `{ "options": [...] }`; atomic replacement |
| GET | `/api/questions/:questionId/options/:id` | Safe option detail |
| PATCH | `/api/questions/:questionId/options/:id` | `optionText` and/or `isCorrect` |
| DELETE | `/api/questions/:questionId/options/:id` | Remove option, preserving valid answer bank |

All POST/PUT/PATCH/DELETE content routes require the admin key. Successful creates return 201, updates return 200, and deletes return 204. Reads and writes return safe projections, never raw ORM question rows.

A question creation body:

```json
{
  "topicId": "30000000-0000-4000-8000-000000000001",
  "questionText": "In a fictional enzyme experiment, what happens to apparent Km during competitive inhibition?",
  "explanation": "Competitive inhibition increases apparent Km while leaving Vmax unchanged.",
  "difficulty": "MEDIUM",
  "options": [
    { "optionText": "Increases", "isCorrect": true },
    { "optionText": "Decreases", "isCorrect": false }
  ]
}
```

The four metadata fields are `topicId`, `questionText`, `explanation`, and `difficulty`. POST defaults difficulty to `MEDIUM`; PUT requires it. Difficulty accepts `EASY`, `MEDIUM`, or `HARD`. Names/text are trimmed and cannot be blank. A question requires 2–8 options and exactly one correct option. Changing the answer key generally requires replacing the complete option collection in one PUT; individual writes must also leave exactly one correct option.

Replacing options generates new option UUIDs and invalidates previously fetched option IDs. All question/option edits and deletion are rejected once the question has attempts. Create a new question to revise recorded content. Options are deleted transactionally when deleting an unused question. Database foreign keys remain the final protection against concurrent relationship changes.

Public question responses include schema fields `topicId`, `questionText`, `difficulty`, and `createdDate`, plus `subject`, `prompt` (alias for questionText), and option `text` (alias for optionText) for the existing web app.

## Learner endpoints

| Method | Route | Input / behavior |
| --- | --- | --- |
| POST | `/api/answers` | `{ "questionId": "UUID", "optionId": "UUID", "timeTaken": 17 }` |
| GET | `/api/attempts` | Paginated history; optional `questionId` filter |
| GET | `/api/attempts/:id` | Own attempt; 404 for another session's record |
| GET | `/api/attempts/:id/explanation` | Own submitted attempt's answer/explanation for persisted review; 404 for another session |
| GET | `/api/progress` | Latest answer per question: `answered`, `correct`, `accuracy` |
| GET | `/api/bookmarks` | Paginated own bookmarks with safe question details |
| POST | `/api/bookmarks` | `{ "questionId": "UUID" }`; 201 new, 200 existing |
| DELETE | `/api/bookmarks/:id` | Own bookmark; 204 deleted, 404 absent/another session |
| GET | `/api/statistics` | All-attempt totals and per-subject/per-topic breakdowns |

Answer submission validates option ownership, locks the question against content changes, reads the correct answer from PostgreSQL, and saves the result in one transaction. The request cannot supply `isCorrect`, `userId`, explanation, or an answer key. Invalid selections create no attempts. Repeated submissions create separate history rows. `timeTaken` is an integer from 0 to 2147483647 in seconds and defaults to zero; it is client-reported elapsed time.

Submission response:

```json
{
  "attemptId": "UUID",
  "questionId": "UUID",
  "selectedOptionId": "UUID",
  "correctOptionId": "UUID",
  "correct": true,
  "explanation": "The explanation is available after this submission."
}
```

`/api/statistics` returns `totalAttempts`, `correctAttempts`, `questionsAnswered` (distinct questions), `accuracy` (rounded percentage), `averageTimeTaken` (seconds rounded to two decimals), `bySubject`, and `byTopic`. Group rows include `id`, `name`, and the same metrics. Optional inclusive `from`/`to` filters accept ISO timestamps with timezones; `from` must precede `to`. Empty statistics return zeros and empty breakdowns. Statistics include every attempt; `/api/progress` instead reports only the latest attempt per question.

## Pagination and errors

List queries accept `page` (default 1, maximum 10000) and `limit` (default 50, maximum 100). Subjects, topics, attempts, and bookmarks return `{ "data": [...], "pagination": { "page": 1, "limit": 50, "total": 3, "pages": 1 } }`. Questions preserve the web app's array response, with `X-Total-Count`, `X-Page`, and `X-Limit` headers. Unknown/repeated invalid query parameters are rejected. IDs are UUIDs, timestamps are ISO strings, and response fields use camelCase.

Errors use `{ "error": "Message", "code": "CODE" }`. Validation errors additionally include `issues` with field paths and messages. Statuses: 400 invalid input, 401 service key missing, 403 admin key invalid/missing, 404 missing or unowned record, 409 relationship/history conflict, 413 body over 100 KB, 503 unavailable database or unconfigured administration. Unexpected failures return a generic 500. Driver messages, SQL, stack traces, and secrets are not returned.

## Render and checks

Use the repository's Render Blueprint. It builds the API from the workspace root, generates Prisma Client, runs committed migrations before deployment, and starts `node dist/server.js`. Configure server-only `DATABASE_URL` (Neon pooled) and `DIRECT_URL` (Neon direct). Production requires distinct `API_KEY` and `API_ADMIN_KEY`; the Blueprint generates both but shares only the service key with the BFF. Never prefix secrets with `VITE_`.

`GET /health` checks process liveness. `GET /ready` probes PostgreSQL and returns 503 when unavailable. Successful responses identify `storage: postgresql` or `storage: memory`; memory mode supports only the limited practice demo. The API binds to `0.0.0.0` on Render's `PORT`; invalid ports fail startup. SIGTERM/SIGINT stop HTTP connections and disconnect Prisma, with a ten-second shutdown deadline. Migrations must be applied before startup; seed explicitly after the first deployment. No schema migration is required by these routes.

```bash
npm run db:validate
npm run typecheck
npm test
npm run build
```

Database tests use embedded PostgreSQL, migrations, and seeds with temporary sockets, covering content CRUD, protected writes, private learner records, server-side grading, answer hiding, statistics, and failure handling. No Neon credentials are needed. In-memory mode retains the original practice endpoints; the new resource endpoints return 503 until a database is configured.
