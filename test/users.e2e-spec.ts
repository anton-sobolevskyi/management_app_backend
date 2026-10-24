import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, getAuthToken } from './helpers';
import { UserResponseDto } from '../src/users/dto/user-response.dto';

describe('Users (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    app = await createTestApp();
    accessToken = await getAuthToken(app, undefined, 'password1');

    const res: { body: UserResponseDto } = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    userId = res.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /users/me', () => {
    return request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('GET /users/:id (self)', () => {
    return request(app.getHttpServer())
      .get(`/users/${userId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('GET /users/:id (other) → 403', async () => {
    // random UUID not owned by current user
    await request(app.getHttpServer())
      .get('/users/00000000-0000-4000-8000-000000000099')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('PATCH /users/me', () => {
    return request(app.getHttpServer())
      .patch('/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Updated Name' })
      .expect(200);
  });

  it('DELETE /users/me', () => {
    return request(app.getHttpServer())
      .delete('/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: 'password1' })
      .expect(200);
  });
});
