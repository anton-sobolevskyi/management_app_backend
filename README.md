# Management App API

[![API Docs](https://img.shields.io/badge/API-Swagger-85EA2D?logo=swagger)](https://management-app-backend-qs3u.onrender.com/api-docs)

Modular project management backend API for teams — projects, tasks, comments, and file attachments.

**Live API docs:** [management-app-backend-qs3u.onrender.com/api-docs](https://management-app-backend-qs3u.onrender.com/api-docs)

## Goals / Purpose

Portfolio project built to demonstrate backend engineering skills relevant to job applications:

- Production-style REST API with NestJS modular architecture
- Auth (JWT + refresh rotation), roles, soft deletes, and S3 file handling
- Prisma + PostgreSQL, Docker, CI, and deployable setup (Render)
- Clear domain model for a real product (projects, tasks, collaboration)

## Features

- JWT authentication with access/refresh token rotation
- Projects with member roles (`OWNER`, `ADMIN`, `MEMBER`)
- Tasks with status (`TODO`, `IN_PROGRESS`, `IN_REVIEW`, `DONE`) and priority
- Task assignment, due dates, and soft deletes
- Comments on tasks
- File attachments (tasks, comments, user avatars) via S3-compatible storage
- Swagger/OpenAPI docs at `/api-docs`
- Request validation with `class-validator`

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

- Feature-based NestJS modules (`auth`, `users`, `projects`, `tasks`, `comments`, `attachments`)
- Soft deletes on core entities (`deletedAt`)
- Refresh token storage and rotation
- Presigned S3 URLs for uploads/downloads
- E2E tests with Testcontainers (PostgreSQL)
- CI via GitHub Actions; deploy config for Render

## Project Structure

```
src/
├── auth/           # Register, login, JWT strategies, guards
├── users/          # Profile and avatar
├── projects/       # Projects and membership
├── tasks/          # Task lifecycle
├── comments/       # Task comments
├── attachments/    # S3 uploads/downloads
├── prisma/         # Prisma module/service
├── s3/             # S3 client wrapper
├── config/
└── main.ts

prisma/
├── schema.prisma
├── migrations/
└── seed.ts
```

## Getting Started

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- [mise](https://mise.jdx.dev/) (recommended for tasks)

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
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | Access token secret |
| `JWT_REFRESH_SECRET` | Refresh token secret |
| `JWT_EXPIRES_IN` | Access token TTL (e.g. `15m`) |
| `REFRESH_TOKEN_EXPIRES_IN` | Refresh token TTL (e.g. `7d`) |
| `AWS_REGION` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | S3 credentials |
| `AWS_S3_BUCKET` / `AWS_S3_ENDPOINT` | Bucket and optional custom endpoint |
| `FRONTEND_URL` | CORS origin |

### Development

```bash
mise run db-setup   # start DB, generate client, migrate, seed
mise run dev        # start API in watch mode
# → http://localhost:3000
# → Swagger: http://localhost:3000/api-docs
```

Without mise:

```bash
docker compose up -d
npm run db:generate
npm run db:migrate
npm run db:seed
npm run start:dev
```

### Build & Production

```bash
npm run build
npm run start:prod
```

### Tests

```bash
npm test            # unit
npm run test:e2e    # e2e (Testcontainers)
```

## Scripts

| Command | Description |
|---------|-------------|
| `mise run dev` | Start dev server |
| `mise run db-up` / `db-down` | Start/stop Postgres containers |
| `mise run db-setup` | Full DB init (up + generate + migrate + seed) |
| `npm run start:dev` | Nest watch mode |
| `npm run build` | Production build |
| `npm run db:generate` | Prisma client |
| `npm run db:migrate` | Run migrations |
| `npm run db:seed` | Seed database |
| `npm run db:studio` | Prisma Studio |
| `npm run lint` | ESLint |
| `npm test` / `npm run test:e2e` | Unit / e2e tests |

## Key Implementation Details

- **Roles:** `OWNER`, `ADMIN`, `MEMBER` on `ProjectMember`
- **Task status:** `TODO` → `IN_PROGRESS` → `IN_REVIEW` → `DONE`
- **Priority:** `LOW`, `MEDIUM`, `HIGH`, `URGENT`
- **Attachments:** linked to tasks, comments, or user avatar; stored in S3
- **Auth:** access JWT + refresh tokens persisted and rotatable

## License

Portfolio project. Free to use for learning purposes.
