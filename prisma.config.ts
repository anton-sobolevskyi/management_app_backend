import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "deno run -A --env-file=.env ./prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
