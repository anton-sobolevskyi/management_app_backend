import 'dotenv/config';
import {
  PrismaClient,
  Role,
  TaskStatus,
  Priority,
  AttachmentType,
} from '../src/generated/prisma/client';
import * as bcrypt from 'bcrypt';
import { getDatabaseConfig } from '../src/config/database.config';

const { pool, adapter } = getDatabaseConfig();
const prisma = new PrismaClient({ adapter });

const cleanUpDatabase = async () => {
  await prisma.attachment.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
};

const attachAvatarTo = async (user: { id: string }, name: string) => {
  const avatar = await prisma.attachment.create({
    data: {
      fileName: `${name}-avatar.jpg`,
      mimeType: 'image/jpeg',
      sizeBytes: 45231,
      s3Key: `avatars/${user.id}/avatar.jpg`,
      s3Bucket: 'taskflow-dev-uploads',
      type: AttachmentType.IMAGE,
      uploadedById: user.id,
    },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { avatarId: avatar.id },
  });
};

const createUser = async (dto: {
  email: string;
  name: string;
  passwordHash: string;
}) => {
  return await prisma.user.create({
    data: {
      email: dto.email,
      passwordHash: dto.passwordHash,
      name: dto.name,
    },
  });
};

const createUsers = async () => {
  const passwordHash = await bcrypt.hash('password123', 10);

  return {
    alice: await createUser({
      email: 'alice@example.com',
      passwordHash,
      name: 'Alice Johnson',
    }),
    bob: await createUser({
      email: 'bob@example.com',
      passwordHash,
      name: 'Bob Smith',
    }),
    carol: await createUser({
      email: 'carol@example.com',
      passwordHash,
      name: 'Carol Davis',
    }),
    dave: await createUser({
      email: 'dave@example.com',
      passwordHash,
      name: 'Dave Wilson',
    }),
  };
};

async function main() {
  console.log('Seeding database...\n');

  await cleanUpDatabase();

  const { alice, bob, dave, carol } = await createUsers();

  console.log(`Created ${4} users`);

  await attachAvatarTo(alice, 'alice');
  await attachAvatarTo(bob, 'bob');

  console.log('Created avatars for Alice and Bob');

  const websiteProject = await prisma.project.create({
    data: {
      name: 'Website Redesign',
      description: 'Complete overhaul of the marketing website',
      members: {
        create: [
          { userId: alice.id, role: Role.OWNER },
          { userId: bob.id, role: Role.ADMIN },
          { userId: carol.id, role: Role.MEMBER },
        ],
      },
    },
  });

  const mobileProject = await prisma.project.create({
    data: {
      name: 'Mobile App Launch',
      description: 'Native iOS/Android app for TaskFlow',
      members: {
        create: [
          { userId: bob.id, role: Role.OWNER },
          { userId: dave.id, role: Role.MEMBER },
        ],
      },
    },
  });

  const internalProject = await prisma.project.create({
    data: {
      name: 'Internal Tools',
      description: 'Dashboards and admin tooling for the team',
      members: {
        create: [
          { userId: carol.id, role: Role.OWNER },
          { userId: alice.id, role: Role.MEMBER },
          { userId: dave.id, role: Role.MEMBER },
        ],
      },
    },
  });

  console.log(`Created 3 projects with members`);

  const task1 = await prisma.task.create({
    data: {
      title: 'Design new homepage layout',
      description:
        'Create wireframes and high-fidelity mockups for the new homepage',
      status: TaskStatus.IN_PROGRESS,
      priority: Priority.HIGH,
      dueDate: daysFromNow(5),
      projectId: websiteProject.id,
      createdById: alice.id,
      assignedToId: carol.id,
    },
  });

  await prisma.task.create({
    data: {
      title: 'Set up CI/CD pipeline',
      description:
        'Configure GitHub Actions for automated testing and deployment',
      status: TaskStatus.TODO,
      priority: Priority.MEDIUM,
      dueDate: daysFromNow(10),
      projectId: websiteProject.id,
      createdById: alice.id,
      assignedToId: bob.id,
    },
  });

  const task3 = await prisma.task.create({
    data: {
      title: 'Fix responsive layout bug on pricing page',
      description: 'Pricing cards overflow on screens narrower than 375px',
      status: TaskStatus.IN_REVIEW,
      priority: Priority.URGENT,
      dueDate: daysFromNow(2),
      projectId: websiteProject.id,
      createdById: bob.id,
      assignedToId: bob.id,
    },
  });

  await prisma.task.create({
    data: {
      title: 'Write copy for About page',
      status: TaskStatus.DONE,
      priority: Priority.LOW,
      projectId: websiteProject.id,
      createdById: alice.id,
      assignedToId: carol.id,
    },
  });

  const task5 = await prisma.task.create({
    data: {
      title: 'Implement push notifications',
      description: 'Integrate Firebase Cloud Messaging for iOS and Android',
      status: TaskStatus.IN_PROGRESS,
      priority: Priority.HIGH,
      dueDate: daysFromNow(7),
      projectId: mobileProject.id,
      createdById: bob.id,
      assignedToId: dave.id,
    },
  });

  await prisma.task.create({
    data: {
      title: 'App Store submission checklist',
      status: TaskStatus.TODO,
      priority: Priority.MEDIUM,
      dueDate: daysFromNow(14),
      projectId: mobileProject.id,
      createdById: bob.id,
    },
  });

  await prisma.task.create({
    data: {
      title: 'Build analytics dashboard',
      description: 'Show task completion rates and team velocity',
      status: TaskStatus.TODO,
      priority: Priority.MEDIUM,
      projectId: internalProject.id,
      createdById: carol.id,
      assignedToId: alice.id,
    },
  });

  await prisma.task.create({
    data: {
      title: 'Migrate admin panel to new design system',
      status: TaskStatus.IN_PROGRESS,
      priority: Priority.LOW,
      projectId: internalProject.id,
      createdById: carol.id,
      assignedToId: dave.id,
    },
  });

  console.log(`Created 8 tasks across 3 projects`);

  const comment1 = await prisma.comment.create({
    data: {
      content:
        "I've uploaded the first draft of the wireframes, please take a look.",
      taskId: task1.id,
      authorId: carol.id,
    },
  });

  await prisma.comment.create({
    data: {
      content: 'Looks great! Can we make the hero section a bit taller?',
      taskId: task1.id,
      authorId: alice.id,
    },
  });

  await prisma.comment.create({
    data: {
      content: 'This is blocking the release, prioritizing it now.',
      taskId: task3.id,
      authorId: bob.id,
    },
  });

  await prisma.comment.create({
    data: {
      content:
        'Firebase setup is done, working on the notification handlers next.',
      taskId: task5.id,
      authorId: dave.id,
    },
  });

  console.log(`Created 4 comments`);

  await prisma.attachment.create({
    data: {
      fileName: 'homepage-wireframe-v1.png',
      mimeType: 'image/png',
      sizeBytes: 812_450,
      s3Key: `tasks/${task1.id}/homepage-wireframe-v1.png`,
      s3Bucket: 'taskflow-dev-uploads',
      type: AttachmentType.IMAGE,
      uploadedById: carol.id,
      taskId: task1.id,
    },
  });

  await prisma.attachment.create({
    data: {
      fileName: 'wireframe-feedback.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 204_112,
      s3Key: `comments/${comment1.id}/wireframe-feedback.pdf`,
      s3Bucket: 'taskflow-dev-uploads',
      type: AttachmentType.FILE,
      uploadedById: alice.id,
      commentId: comment1.id,
    },
  });

  await prisma.attachment.create({
    data: {
      fileName: 'pricing-bug-screenshot.png',
      mimeType: 'image/png',
      sizeBytes: 156_300,
      s3Key: `tasks/${task3.id}/pricing-bug-screenshot.png`,
      s3Bucket: 'taskflow-dev-uploads',
      type: AttachmentType.IMAGE,
      uploadedById: bob.id,
      taskId: task3.id,
    },
  });

  console.log(`Created 3 attachments`);

  const archivedTask = await prisma.task.create({
    data: {
      title: 'Old task from previous sprint',
      status: TaskStatus.DONE,
      priority: Priority.LOW,
      projectId: websiteProject.id,
      createdById: alice.id,
      deletedAt: new Date(),
    },
  });

  console.log(`Created 1 soft-deleted task (id: ${archivedTask.id})`);

  console.log('\nSeed completed successfully!\n');
  console.log('Test credentials (all users share the same password):');
  console.log('  alice@example.com / password123  (Owner: Website Redesign)');
  console.log('  bob@example.com   / password123  (Owner: Mobile App Launch)');
  console.log('  carol@example.com / password123  (Owner: Internal Tools)');
  console.log('  dave@example.com  / password123  (Member)');
}

function daysFromNow(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
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
