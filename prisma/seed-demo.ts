import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '../src/generated/prisma/client';
import { getAppConfig } from '../src/config/app.config';
import { getDatabaseConfig } from '../src/config/database.config';
import { assertSafeToSeedDemo } from '../src/config/seed-guard';
import { loadDemoData, printDemoAccounts } from './demo-loader';

/**
 * Non-destructive demo seed, safe to run against a live database (see assertSafeToSeedDemo).
 *
 *   # local
 *   npm run db:seed:demo
 *
 *   # live database (e.g. the one behind your Render service)
 *   DATABASE_URL='postgresql://…?sslmode=require' \
 *   ALLOW_REMOTE_SEED=true SEED_DEMO_PASSWORD='choose-a-password-1' \
 *   npm run db:seed:demo
 */
let password: string;
try {
  password = assertSafeToSeedDemo();
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

const { pool, adapter } = getDatabaseConfig(2);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Adding demo data (existing non-demo data is left untouched)...');
  const passwordHash = await bcrypt.hash(password, getAppConfig().bcryptRounds);
  const summary = await loadDemoData(prisma, { passwordHash });

  console.log(
    `Done: ${summary.users} users, ${summary.projects} projects, ` +
      `${summary.tasks} tasks, ${summary.comments} comments.`,
  );
  printDemoAccounts(password);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
