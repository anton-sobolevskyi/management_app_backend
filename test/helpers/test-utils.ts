import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AuthResponseDto } from '../../src/auth/dto/auth-response.dto';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../../src/prisma/prisma.service';

export async function createTestApp(): Promise<INestApplication> {
  process.env.NODE_ENV = 'test';
  process.env.DISABLE_THROTTLE = 'true';

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Same error shape as production (main.ts)
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return app;
}

export type TestUser = {
  accessToken: string;
  email: string;
  password: string;
  name: string;
};

/** Mark an address as confirmed, as if the user had followed the mailed link. */
export async function verifyEmail(
  app: INestApplication,
  email: string,
): Promise<void> {
  await app.get(PrismaService).user.updateMany({
    where: { email: email.trim().toLowerCase(), deletedAt: null },
    data: { emailVerifiedAt: new Date() },
  });
}

/**
 * Register a fresh user — password must include a letter and a number.
 * The address is marked verified by default (inviting needs verified users);
 * pass `verified: false` to test the sign-up state itself.
 */
export async function registerUser(
  app: INestApplication,
  overrides?: Partial<{
    email: string;
    password: string;
    name: string;
    verified: boolean;
  }>,
): Promise<TestUser> {
  const email =
    overrides?.email ??
    `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = overrides?.password ?? 'password1';
  const name = overrides?.name ?? 'Test User';

  const res: { body: AuthResponseDto } = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password, name })
    .expect(201);

  if (overrides?.verified !== false) {
    await verifyEmail(app, email);
  }

  return { accessToken: res.body.accessToken, email, password, name };
}

export async function getAuthToken(
  app: INestApplication,
  email = `test-${Date.now()}@example.com`,
  password = 'password1',
): Promise<string> {
  const user = await registerUser(app, { email, password });
  return user.accessToken;
}

/** Authorization header for supertest: `.set(...bearer(user))`. */
export const bearer = (user: { accessToken: string }) =>
  ['Authorization', `Bearer ${user.accessToken}`] as const;

/** Create a project owned by `owner`, optionally adding members. Returns its id. */
export async function createProject(
  app: INestApplication,
  owner: TestUser,
  members: { user: TestUser; role?: 'ADMIN' | 'MEMBER' }[] = [],
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/projects')
    .set(...bearer(owner))
    .send({ name: 'Test Project' })
    .expect(201);
  const projectId = (res.body as { id: string }).id;

  for (const { user, role = 'MEMBER' } of members) {
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/members`)
      .set(...bearer(owner))
      .send({ email: user.email, role })
      .expect(201);
  }
  return projectId;
}

export async function createTask(
  app: INestApplication,
  user: TestUser,
  projectId: string,
  body: Record<string, unknown> = {},
): Promise<{ id: string; [key: string]: any }> {
  const res = await request(app.getHttpServer())
    .post(`/projects/${projectId}/tasks`)
    .set(...bearer(user))
    .send({ title: 'Task', ...body })
    .expect(201);
  return res.body as { id: string };
}
