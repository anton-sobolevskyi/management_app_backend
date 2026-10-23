# Changes in this revision

Security, performance and code-quality pass. Verified: `tsc`, ESLint, 345 unit tests
(coverage 85 %), 90 e2e tests against real PostgreSQL 16 + an S3 emulator.

## Before deploying

1. Run the new migration `20261022120000_security_and_search_improvements`
   (needs `CREATE EXTENSION pg_trgm`).
2. Set `FRONTEND_URL` in production (the app now refuses to start without it).
3. `JWT_REFRESH_SECRET` is no longer used; remove it whenever convenient.
4. `/api-docs` is off in production unless `SWAGGER_ENABLED=true`.

## Behaviour changes clients may notice

- Replaying a refresh token within 20 s of its rotation returns 401 but keeps the session.
- A password change invalidates access tokens immediately.
- `GET /projects/:id` and `GET /tasks/:id` cap members / comments at 100.
- `page` is capped at 10 000 (400 above that); `assignedToId` must be a UUID.
- Task endpoints answer "Task not found" (404) for non-members, same as for missing tasks.
- Uploads: max 50 attachments per task, 10 per comment; `.doc` must be a real Word file;
  more than `UPLOAD_MAX_CONCURRENCY` simultaneous uploads get 503 + Retry-After.
- Controllers renamed; Swagger operationIds are preserved.

## Not included (need infrastructure or product decisions)

Redis-backed rate limiting (a pluggable store is in place), streaming / presigned direct
uploads, password reset, email verification, 2FA, invitation flow, antivirus scanning,
metrics / Sentry, cursor pagination, removal of deprecated `users/:id` routes,
`forbidNonWhitelisted` (would reject clients that send extra fields).
