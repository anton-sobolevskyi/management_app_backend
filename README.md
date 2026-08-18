# Management App API

A robust, modular project management backend API built with **NestJS**, **Prisma ORM**, and **PostgreSQL**.

## Features

- **Authentication**: Secure JWT-based authentication with access/refresh token rotation.
- **Project Management**: Hierarchical project structure with member roles.
- **Task Management**: Full CRUD operations for tasks, including status tracking (`TODO`, `IN_PROGRESS`, `IN_REVIEW`, `DONE`) and priority levels.
- **Collaboration**: Threaded comments on tasks.
- **File Management**: S3-compatible storage integration for task attachments and user avatars.
- **API Documentation**: Auto-generated Swagger/OpenAPI documentation available at `/api-docs`.
- **Validation**: Strict request validation using `class-validator` and `class-transformer`.

## Tech Stack

- **Framework**: [NestJS](https://nestjs.com/)
- **ORM**: [Prisma](https://www.prisma.io/)
- **Database**: PostgreSQL
- **Authentication**: Passport.js (JWT & Local strategies), bcrypt
- **Storage**: AWS SDK v3 (S3)
- **API Docs**: Swagger/OpenAPI

## Getting Started

### Prerequisites

- Node.js (v20+ recommended)
- Docker & Docker Compose
- [mise](https://mise.jdx.dev/) (recommended for task orchestration)

### Installation

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```

2. Configure your environment variables by copying `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   *Update the values in `.env` to match your local development environment.*

3. Initialize the database and start the development server:
   ```bash
   mise run db-setup
   mise run dev
   ```

## Development Workflow

This project uses [mise](https://mise.jdx.dev/) to simplify common development tasks.

### Mise Tasks
- `mise run dev`: Starts the development server.
- `mise run db-up`: Starts the database containers.
- `mise run db-down`: Stops the database containers.
- `mise run db-setup`: Full database initialization (starts containers, generates client, runs migrations, and seeds).

### NPM Scripts
If you prefer using npm directly:
- `npm run start:dev`: Starts the application in watch mode.
- `npm run build`: Builds the application for production.
- `npm run db:generate`: Generates the Prisma client.
- `npm run db:migrate`: Runs Prisma migrations.
- `npm run db:seed`: Runs database seeding.
- `npm run lint`: Runs ESLint.
- `npm run test`: Runs unit tests.

## API Documentation

Once the server is running, the interactive API documentation is available at:
`http://localhost:3000/api-docs`

## Project Structure

The application is organized into feature-based modules:

- `src/auth`: Handles registration, login, and JWT strategies.
- `src/users`: User profile and avatar management.
- `src/projects`: Project creation and membership management.
- `src/tasks`: Task lifecycle management within projects.
- `src/comments`: Commenting system for tasks.
- `src/attachments`: File upload/download handling via S3.
- `src/prisma`: Database connection service.
- `src/s3`: S3 client wrapper service.
