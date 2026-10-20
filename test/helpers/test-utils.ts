import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AuthResponseDto } from '../../src/auth/dto/auth-response.dto';

export async function createTestApp(): Promise<INestApplication> {
  process.env.NODE_ENV = 'test';
  process.env.DISABLE_THROTTLE = 'true';

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  return app;
}

export type TestUser = {
  accessToken: string;
  email: string;
  password: string;
  name: string;
};

/** Register a fresh user — password must include a letter and a number. */
export async function registerUser(
  app: INestApplication,
  overrides?: Partial<{ email: string; password: string; name: string }>,
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
