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

| Layer        | Technology                          |
|--------------|-------------------------------------|
| Framework    | NestJS 11                           |
| ORM          | Prisma 7                            |
| Database     | PostgreSQL                          |
| Auth         | Passport.js (JWT + Local), bcrypt   |
| Storage      | AWS SDK v3 (S3-compatible)          |
| API Docs     | Swagger / OpenAPI                   |
| Validation   | class-validator, class-transformer  |
| Tooling      | Docker Compose, mise, Husky         |
| Deploy       | Render (`render.yaml`)              |
| Language     | TypeScript                          |

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

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (**required**) |
| `JWT_ACCESS_SECRET` | Access token secret (**required**) |
| `JWT_REFRESH_SECRET` | Refresh token secret (**required**) |
| `AWS_REGION` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | S3 credentials |
| `AWS_S3_BUCKET` / `AWS_S3_ENDPOINT` | Bucket and optional custom endpoint |
| `FRONTEND_URL` | CORS origin(s), comma-separated |

### Development

```bash
mise run db-setup   # start DB, generate client, migrate, seed
mise run dev        # → http://localhost:3000  Swagger: /api-docs
```

### Tests

```bash
mise run test-unit
mise run test-e2e
```

## API notes

- **List endpoints** return `{ data: T[], meta: { total, page, limit, totalPages } }`
- **Passwords** must be ≥ 8 chars with at least one letter and one number
- **Members:** `GET/POST/PATCH/DELETE /projects/:projectId/members`, ownership transfer at `POST .../members/:userId/transfer-ownership`
- **Tasks filters:** `q`, `status`, `assignedToId`, `dueBefore`, `dueAfter`
- **Users:** only `/users/me` and self-scoped `/:id` (no global user directory)

## License

Portfolio project. Free to use for learning purposes.
