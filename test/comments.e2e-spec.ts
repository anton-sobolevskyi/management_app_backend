import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, getAuthToken } from './test-utils';

describe('Comments (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let taskId: string;
  let commentId: string;

  beforeAll(async () => {
    app = await createTestApp();
    accessToken = await getAuthToken(app);

    // Setup: Need a project and task first
    const proj = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'P' });
    const task = await request(app.getHttpServer())
      .post(`/projects/${proj.body.id}/tasks`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'T' });
    taskId = task.body.id;
  });

  it('POST /tasks/:taskId/comments', async () => {
    const res = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/comments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ content: 'New Comment' })
      .expect(201);
    commentId = res.body.id;
  });

  it('GET /tasks/:taskId/comments', () => {
    return request(app.getHttpServer())
      .get(`/tasks/${taskId}/comments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('GET /comments/:id', () => {
    return request(app.getHttpServer())
      .get(`/comments/${commentId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('PATCH /comments/:id', () => {
    return request(app.getHttpServer())
      .patch(`/comments/${commentId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ content: 'Updated' })
      .expect(200);
  });

  it('DELETE /comments/:id', () => {
    return request(app.getHttpServer())
      .delete(`/comments/${commentId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });
});
