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
- PostgreSQL
- S3-compatible storage (e.g., AWS S3, MinIO)

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

3. Run database migrations to set up the schema:
   ```bash
   npm run db:migrate
   ```

4. Start the development server:
   ```bash
   npm run start:dev
   ```

## Available Scripts

- `npm run start:dev`: Starts the application in watch mode.
- `npm run build`: Builds the application for production.
- `npm run db:migrate`: Runs Prisma migrations.
- `npm run db:generate`: Generates the Prisma client.
- `npm run lint`: Runs ESLint to check code quality.
- `npm run test`: Runs unit tests with Jest.
- `npm run test:e2e`: Runs end-to-end tests.

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
