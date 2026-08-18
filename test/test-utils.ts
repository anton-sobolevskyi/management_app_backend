import { INestApplication } from '@nestjs/common';
import request from 'supertest';

export async function getAuthToken(
  app: INestApplication,
  email = `test-${Date.now()}@example.com`,
  password = 'password123',
): Promise<string> {
  // Register a new user
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password, name: 'Test User' });

  // Login to get the token
  const loginRes = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password });

  return loginRes.body.accessToken;
}
