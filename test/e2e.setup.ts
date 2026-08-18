import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'child_process';

// Increase timeout for container startup
jest.setTimeout(120000);

let postgresContainer: any;

beforeAll(async () => {
  postgresContainer = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('test_db')
    .withUsername('test_user')
    .withPassword('test_password')
    .start();

  const dbUrl = postgresContainer.getConnectionUri();
  process.env.DATABASE_URL = dbUrl;

  // Run migrations against the containerized database
  // We pass the DATABASE_URL explicitly to the environment of the child process
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: dbUrl },
  });
});

afterAll(async () => {
  if (postgresContainer) {
    await postgresContainer.stop();
  }
});
