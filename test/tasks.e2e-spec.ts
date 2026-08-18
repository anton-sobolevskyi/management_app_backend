import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, getAuthToken } from './test-utils';

describe('Tasks (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    accessToken = await getAuthToken(app);
  });

  it('/tasks (POST)', () => {
    return request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'New Task', projectId: 'some-project-id' })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });
});
