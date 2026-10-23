# Management App API

[![API Docs](https://img.shields.io/badge/API-Swagger-85EA2D?logo=swagger)](https://management-app-backend-qs3u.onrender.com/api-docs)

Modular project management backend API for teams — projects, tasks, comments, and file attachments.

**Live API docs:** [management-app-backend-qs3u.onrender.com/api-docs](https://management-app-backend-qs3u.onrender.com/api-docs)

## Goals / Purpose

Portfolio project built to demonstrate backend engineering skills:

- Production-style REST API with NestJS modular architecture
- Auth (JWT + hashed refresh rotation), RBAC, soft deletes, S3 files
- Prisma + PostgreSQL, Docker, CI, deployable setup (Render)
- Clear domain model for a real product (projects, tasks, collaboration)

## Features

- JWT authentication with **hashed** refresh tokens and rotation
- Auth rate limiting (register / login / refresh)
- Projects with member roles (`OWNER`, `ADMIN`, `MEMBER`)
- Member management (invite by email, role updates, ownership transfer, self-leave)
- Tasks with status, priority, assignee (must be a member), search & date filters
- Paginated list endpoints (`{ data, meta }`)
- Comments with author-or-admin edit rules
- File attachments via S3; cleaned up on parent soft-delete
- Soft deletes with cascade (project → tasks → comments)
- User profile is **self-only** (`/users/me`); soft-delete frees email for re-registration
- Swagger/OpenAPI at `/api-docs`
- Request validation, security headers, request IDs, global exception filter

## Tech Stack

| Layer      | Technology                         |
| ---------- | ---------------------------------- |
| Framework  | NestJS 11                          |
| ORM        | Prisma 7                           |
| Database   | PostgreSQL                         |
| Auth       | Passport.js (JWT + Local), bcrypt  |
| Storage    | AWS SDK v3 (S3-compatible)         |
| API Docs   | Swagger / OpenAPI                  |
| Validation | class-validator, class-transformer |
| Tooling    | Docker Compose, mise, Husky        |
| Deploy     | Render (`render.yaml`)             |
| Language   | TypeScript                         |

## Architecture Highlights

- Feature-based NestJS modules + global `AuthorizationModule`
- `ProjectMemberGuard` + `@Roles()` for membership/RBAC (404 for non-members)
- Soft deletes on core entities (`deletedAt`)
- Refresh tokens stored as SHA-256 hashes
- Presigned S3 URLs for downloads
- E2E tests with Testcontainers (PostgreSQL)
- CI via GitHub Actions

## Project Structure

```
src/
├── auth/           # Register, login, JWT strategies, guards, throttle
├── users/          # Self-only profile
├── projects/       # Projects, membership, ownership transfer
├── tasks/          # Task lifecycle + filters
├── comments/       # Task comments
├── attachments/    # S3 uploads/downloads + cleanup
├── common/         # Authz, pagination, throttler, filters
├── prisma/
├── s3/
├── config/
└── main.ts
```

## Getting Started

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- [mise](https://mise.jdx.dev/) (recommended)

### Installation

```bash
git clone https://github.com/anton-sobolevskyi/management_app_backend.git
cd management_app_backend
npm install
cp .env.example .env
```

### Environment

| Variable                                                     | Description                                                                                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                                               | PostgreSQL connection string (**required**)                                                                                          |
| `JWT_ACCESS_SECRET`                                          | Access token secret (**required**)                                                                                                   |
| `AWS_REGION` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | S3 credentials                                                                                                                       |
| `AWS_S3_BUCKET` / `AWS_S3_ENDPOINT`                          | Bucket and optional custom endpoint                                                                                                  |
| `FRONTEND_URL`                                               | CORS origin(s), comma-separated (**required in production**). Also the allow-list for `Origin` on `/auth/refresh` and `/auth/logout` |
| `COOKIE_SAME_SITE`                                           | `lax` (default), `strict` or `none`. Use `none` (HTTPS only) when the frontend and API are on different sites                        |
| `TRUST_PROXY`                                                | Reverse-proxy hops in front of the app (default `1` in production, `0` otherwise). Drives `req.ip` for rate limiting; avoid `true`   |
| `JWT_EXPIRES_IN` / `REFRESH_TOKEN_EXPIRES_IN`                | Token lifetimes, e.g. `15m`, `7d` (defaults `15m` / `7d`). Validated at startup                                                      |
| `BCRYPT_ROUNDS`                                              | bcrypt cost, 10–15 (default `12`)                                                                                                    |
| `DB_POOL_MAX`                                                | Connections per instance (default `10`)                                                                                              |
| `SWAGGER_ENABLED`                                            | `/api-docs` is on by default outside production; in production it is off unless set to `true`                                        |
| `RATE_LIMIT_PER_MINUTE`                                      | Default per-IP ceiling for every route without its own `@Throttle` (default `600`; health probes are exempt)                         |
| `DISABLE_THROTTLE`                                           | `true` turns rate limiting off (load tests only; the app refuses to start with it in production)                                     |
| `UPLOAD_MAX_CONCURRENCY`                                     | Uploads received at once (each is buffered in memory, up to 10 MB); extra requests get `503` + `Retry-After` (default `8`)           |
| `LOG_LEVEL`                                                  | pino level: `debug` (default outside production), `info` (production), `warn`, … Logs are JSON, one line per request with `req.id`   |
| `RUN_MIGRATIONS`                                             | Docker only. `false` skips `prisma migrate deploy` at start (use with several replicas)                                              |

In production `JWT_ACCESS_SECRET` must be at least 32 characters and `FRONTEND_URL` must be set; the app refuses to start otherwise.

`JWT_REFRESH_SECRET` is no longer used: refresh tokens are opaque random strings stored hashed in the database. It may stay in existing deployments and is ignored.

### Security notes

- **Refresh rotation.** Replaying an already-used refresh token inside a 20 s grace window (a second tab, a retried request) is rejected with `401` but keeps the session; replaying it later is treated as theft and revokes every session of the user. Clients should simply retry once after a `401` on refresh, using the cookie from the first response.
- **Access tokens** carry a version (`tv`); changing the password bumps it, so old access tokens stop working immediately instead of at expiry.
- **Rate limiting** is in-memory per process. With several instances the limits are per instance; plug a shared store (e.g. Redis) in via `setRateLimitStore` in `src/common/throttler/rate-limit.store.ts`.
- **Search** (`?q=`) relies on `pg_trgm` GIN indexes created by migration `20261022120000_*`; the database role running migrations must be allowed to `CREATE EXTENSION pg_trgm` (a trusted extension on PostgreSQL 13+).

### Development

```bash
mise run db-setup   # start DB, generate client, migrate, seed
mise run dev        # → http://localhost:3000  Swagger: /api-docs
```

### Tests

```bash
mise run test-unit
mise run test-e2e   # needs Docker: throwaway Postgres + MinIO via Testcontainers, no cloud credentials
```

`.env.test` holds harmless placeholders only; never put real credentials in it.

CI (`.github/workflows/ci.yml`) runs lint on production source, type-check, build, unit tests,
`npm audit` (production, high+), the e2e suite and a Docker image build.

### Docker

The image runs as the unprivileged `node` user, applies migrations on start and then `exec`s node
so it receives SIGTERM and shuts down gracefully (Prisma pool closed, in-flight requests finished).
Probes: `GET /` is liveness, `GET /health` is readiness (checks the database). The image's
`HEALTHCHECK` and `render.yaml` use `/health`.

### Seeding

`npm run db:seed` **deletes every row** before inserting demo data. It refuses `NODE_ENV=production`
and any non-local `DATABASE_URL` unless `ALLOW_REMOTE_SEED=true`.

## API notes

- **List endpoints** return `{ data: T[], meta: { total, page, limit, totalPages } }`
- **Auth:** the refresh token is an HttpOnly cookie (`path=/auth`) and never appears in a response body. `POST /auth/refresh` reads it, rotates it and returns `{ accessToken, expiresIn }` (seconds) with status 200. Replaying an already-rotated or logged-out refresh token revokes all of that user's sessions, so clients should serialise refresh calls (one in flight at a time, shared across tabs)
- **Errors:** `{ statusCode, code, message, timestamp, path, requestId }`. `code` is a stable identifier such as `NOT_FOUND` or `CONFLICT`; `message` is a string, or a string array for validation errors. Unexpected errors always return `Internal server error`; Prisma unique / not-found / foreign-key errors map to 409 / 404 / 409. Every response carries `X-Request-Id` (a client-supplied id is kept only if it matches `[A-Za-z0-9._-]{1,128}`)
- **Dates:** `dueDate`, `dueBefore` and `dueAfter` take ISO 8601 (`2026-10-31` or `2026-10-31T17:00:00Z`; include `Z` or an offset). Impossible dates such as `2026-02-31` are rejected. `PATCH /tasks/:id` with `"dueDate": null` clears it. A date-only `dueBefore` includes that whole day (UTC)
- **Emails** are trimmed and lower-cased on input, so `Alice@X.com` and `alice@x.com` are the same account
- **Passwords** must be 8–72 bytes with at least one letter and one number. `PATCH /users/me/password` (`{ currentPassword, newPassword }`, 204) revokes every refresh token
- **Account deletion** (`DELETE /users/me`) returns 409 while you are the only OWNER of a project that has other members. Otherwise it removes your memberships, unassigns your tasks, deletes projects where you were the only member, and erases your name, password hash, avatar and email. Password reset and email verification are not implemented
- **Attachments:** the uploaded bytes must match the declared type (jpeg, png, webp, pdf, doc, txt; max 10 MB). Delete = uploader or project OWNER/ADMIN; attaching to a comment = comment author or OWNER/ADMIN. Avatars are readable by their owner and by users who share a project with them. Storage keys are never returned; downloads use a signed URL (`inline` for images, `attachment` otherwise)
- **Members:** `GET/POST/PATCH/DELETE /projects/:projectId/members`, ownership transfer at `POST .../members/:userId/transfer-ownership`
- **Tasks filters:** `q`, `status`, `assignedToId`, `dueBefore`, `dueAfter`
- **Users:** `/users/me` (the self-scoped `/users/:id` routes are deprecated; no global user directory)
- **Projects list** returns the first 20 members of each project plus `memberCount`; page through `/projects/:id/members` for the rest

## License

Portfolio project. Free to use for learning purposes.
