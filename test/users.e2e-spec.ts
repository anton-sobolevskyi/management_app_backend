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
    accessToken = await getAuthToken(app);
    // Extract userId from token or fetch current user
    const res: { body: UserResponseDto[] } = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${accessToken}`);
    userId = res.body[0].id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /users', () => {
    return request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('GET /users/:id', () => {
    return request(app.getHttpServer())
      .get(`/users/${userId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('PATCH /users/:id', () => {
    return request(app.getHttpServer())
      .patch(`/users/${userId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Updated Name' })
      .expect(200);
  });

  it('DELETE /users/:id', () => {
    return request(app.getHttpServer())
      .delete(`/users/${userId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });
});
