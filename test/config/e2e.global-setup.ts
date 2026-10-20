import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { config } from 'dotenv';

config({ path: resolve(__dirname, '../.env.test'), override: true });

const STATE_DIR = resolve(__dirname, '../.e2e-state');
const DB_URL_FILE = resolve(STATE_DIR, 'database-url');
const CONTAINER_ID_FILE = resolve(STATE_DIR, 'container-id');

export default async function globalSetup() {
  mkdirSync(STATE_DIR, { recursive: true });

  const container: StartedPostgreSqlContainer =
    await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('test_db')
      .withUsername('test_user')
      .withPassword('test_password')
      .start();

  const dbUrl = container.getConnectionUri();
  process.env.DATABASE_URL = dbUrl;

  writeFileSync(DB_URL_FILE, dbUrl, 'utf8');
  writeFileSync(CONTAINER_ID_FILE, container.getId(), 'utf8');

  // Generate client once, migrate once against the shared container
  execSync('npx prisma generate', {
    env: {
      ...process.env,
      DATABASE_URL: dbUrl,
    },
    stdio: 'inherit',
  });

  execSync('npx prisma migrate deploy', {
    env: {
      ...process.env,
      DATABASE_URL: dbUrl,
    },
    stdio: 'inherit',
  });

  // Expose for teardown via globalThis (same Node process tree for teardown)
  (globalThis as any).__E2E_PG_CONTAINER__ = container;
}
