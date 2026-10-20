import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { execSync } from 'child_process';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env.test'), override: true });

let postgresContainer: StartedPostgreSqlContainer;

jest.setTimeout(120000);

beforeAll(async () => {
  postgresContainer = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('test_db')
    .withUsername('test_user')
    .withPassword('test_password')
    .start();

  const dbUrl = postgresContainer.getConnectionUri();
  process.env.DATABASE_URL = dbUrl;

  // maxWorkers: 1 — sequential migrate only (client generated before Jest)
  execSync('npx prisma migrate deploy', {
    env: { ...process.env },
    stdio: 'inherit',
  });
});

afterAll(async () => {
  if (postgresContainer) {
    await postgresContainer.stop();
  }
});
