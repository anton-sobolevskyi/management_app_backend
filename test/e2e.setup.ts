import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { execSync } from "child_process";

// Increase timeout for container startup
jest.setTimeout(120000);

let postgresContainer: any;

beforeAll(async () => {
  postgresContainer = await new PostgreSqlContainer("postgres:15-alpine")
    .withDatabase("test_db")
    .withUsername("test_user")
    .withPassword("test_password")
    .start();

  process.env.DATABASE_URL = postgresContainer.getConnectionUri();
  
  // Run migrations against the containerized database
  execSync("npx prisma migrate deploy");
});

afterAll(async () => {
  if (postgresContainer) {
    await postgresContainer.stop();
  }
});
