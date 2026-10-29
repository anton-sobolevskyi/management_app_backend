import type { PrismaClient } from '../src/generated/prisma/client';
import {
  DEMO_PROJECTS,
  DEMO_USERS,
  dueDate,
  daysAgo,
  hoursAgo,
  demoId,
} from '../src/seed/demo-data';

export interface DemoSeedSummary {
  users: number;
  projects: number;
  tasks: number;
  comments: number;
}

/**
 * Writes the demo dataset. Idempotent and non-destructive:
 *  - the demo users are upserted by e-mail (their ids, and so any open session, survive)
 *  - the demo projects have fixed ids and are rebuilt from scratch on every run, which
 *    also resets any edits made to them since the last seed
 *  - nothing else in the database is read or modified
 *
 * Runs in one transaction: a failure leaves the database as it was.
 */
export async function loadDemoData(
  prisma: PrismaClient,
  options: { passwordHash: string; now?: Date },
): Promise<DemoSeedSummary> {
  const now = options.now ?? new Date();
  const userIds = new Map<string, string>();
  const summary: DemoSeedSummary = {
    users: DEMO_USERS.length,
    projects: DEMO_PROJECTS.length,
    tasks: 0,
    comments: 0,
  };

  await prisma.$transaction(
    async (tx) => {
      // 1. Accounts. Seeded accounts are usable right away: invites need a verified e-mail.
      for (const user of DEMO_USERS) {
        const saved = await tx.user.upsert({
          where: { email: user.email },
          create: {
            email: user.email,
            name: user.name,
            passwordHash: options.passwordHash,
            emailVerifiedAt: now,
          },
          update: {
            name: user.name,
            passwordHash: options.passwordHash,
            emailVerifiedAt: now,
            deletedAt: null,
          },
          select: { id: true },
        });
        userIds.set(user.key, saved.id);
      }

      const uid = (key: string): string => {
        const id = userIds.get(key);
        if (!id) throw new Error(`Unknown demo user "${key}"`);
        return id;
      };

      // 2. Remove the previous demo projects. Members, tasks, comments and attachments
      //    go with them (ON DELETE CASCADE).
      await tx.project.deleteMany({
        where: {
          id: { in: DEMO_PROJECTS.map((p) => demoId('project', p.key)) },
        },
      });

      // 3. Recreate them.
      for (const project of DEMO_PROJECTS) {
        const projectId = demoId('project', project.key);

        await tx.project.create({
          data: {
            id: projectId,
            name: project.name,
            description: project.description,
            createdAt: daysAgo(now, project.createdDaysAgo),
            updatedAt: daysAgo(now, 0),
          },
        });

        await tx.projectMember.createMany({
          data: project.members.map((member) => ({
            id: demoId('member', project.key, member.user),
            projectId,
            userId: uid(member.user),
            role: member.role,
            joinedAt: daysAgo(now, project.createdDaysAgo),
          })),
        });

        await tx.task.createMany({
          data: project.tasks.map((task) => {
            const createdAt = daysAgo(now, task.createdDaysAgo);
            return {
              id: demoId('task', project.key, task.key),
              title: task.title,
              description: task.description ?? null,
              status: task.status,
              priority: task.priority,
              dueDate:
                task.dueInDays === undefined
                  ? null
                  : dueDate(now, task.dueInDays),
              projectId,
              createdById: uid(task.createdBy),
              assignedToId: task.assignee ? uid(task.assignee) : null,
              createdAt,
              updatedAt:
                task.updatedDaysAgo === undefined
                  ? createdAt
                  : daysAgo(now, task.updatedDaysAgo),
            };
          }),
        });
        summary.tasks += project.tasks.length;

        const comments = project.tasks.flatMap((task) =>
          (task.comments ?? []).map((comment, index) => {
            const createdAt = hoursAgo(now, comment.hoursAgo);
            return {
              id: demoId('comment', project.key, task.key, String(index)),
              content: comment.text,
              taskId: demoId('task', project.key, task.key),
              authorId: uid(comment.by),
              createdAt,
              updatedAt: createdAt,
            };
          }),
        );
        await tx.comment.createMany({ data: comments });
        summary.comments += comments.length;
      }
    },
    { maxWait: 15_000, timeout: 120_000 },
  );

  return summary;
}

export function printDemoAccounts(password: string): void {
  console.log('\nDemo accounts (all share one password):');
  for (const user of DEMO_USERS) {
    console.log(`  ${user.email.padEnd(18)} ${user.name}`);
  }
  console.log(
    password === 'password123'
      ? '\nPassword: password123 (local default)'
      : '\nPassword: the value of SEED_DEMO_PASSWORD',
  );
  console.log(
    'Best first login: alice@example.com (owns projects, has overdue and upcoming tasks)',
  );
}
