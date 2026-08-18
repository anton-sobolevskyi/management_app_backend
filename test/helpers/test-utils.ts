import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import cookieParser from 'cookie-parser';
import request from 'supertest';

export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  return app;
}

export async function getAuthToken(
  app: INestApplication,
  email = `test-${Date.now()}@example.com`,
  password = 'password123',
): Promise<string> {
  // Register a new user
  const { body: { accessToken } } = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password, name: 'Test User' });

  return accessToken;
}
