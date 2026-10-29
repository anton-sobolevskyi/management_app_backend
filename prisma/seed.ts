import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '../src/generated/prisma/client';
import { getAppConfig } from '../src/config/app.config';
import { getDatabaseConfig } from '../src/config/database.config';
import {
  assertSafeToSeed,
  assertSafeToSeedDemo,
} from '../src/config/seed-guard';
import { loadDemoData, printDemoAccounts } from './demo-loader';

/**
 * Full development seed: DELETES EVERY ROW, then loads the demo dataset.
 * For a database that already holds data you want to keep (e.g. the live one),
 * use `npm run db:seed:demo` instead.
 */
let password: string;
try {
  // Before anything connects: this wipes every table.
  assertSafeToSeed();
  password = assertSafeToSeedDemo();
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

const { pool, adapter } = getDatabaseConfig(2);
const prisma = new PrismaClient({ adapter });

const cleanUpDatabase = async () => {
  await prisma.attachment.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.oneTimeToken.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
};

async function main() {
  console.log('Seeding database (wiping all existing data)...\n');
  await cleanUpDatabase();

  const passwordHash = await bcrypt.hash(password, getAppConfig().bcryptRounds);
  const summary = await loadDemoData(prisma, { passwordHash });

  console.log(
    `Created ${summary.users} users, ${summary.projects} projects, ` +
      `${summary.tasks} tasks, ${summary.comments} comments.`,
  );
  console.log('\nSeed completed successfully!');
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
