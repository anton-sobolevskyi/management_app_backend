import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'child_process';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env.test'), override: true });

let postgresContainer: any;

jest.setTimeout(60000);

beforeAll(async () => {
  console.log('RUUUUUUUUUN');
  postgresContainer = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('test_db')
    .withUsername('test_user')
    .withPassword('test_password')
    // .withStartupTimeout(120_000) // wait longer if needed
    // .withReuse() // reuse container between test runs (faster)
    // .withCommand(['postgres', '-c', 'max_connections=200'])
    .start();

  const dbUrl = postgresContainer.getConnectionUri();
  process.env.DATABASE_URL = dbUrl;

  // Run migrations against the containerized database
  // We pass the DATABASE_URL explicitly to the environment of the child process
  execSync('mise run db-test', {
    env: { ...process.env },
  });
});

afterAll(async () => {
  if (postgresContainer) {
    await postgresContainer.stop();
  }
});
