import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, getAuthToken } from './helpers';
import { ProjectResponseDto } from '../src/projects/dto/project-response.dto';
import { TaskResponseDto } from '../src/tasks/dto/task-response.dto';
import { CommentResponseDto } from '../src/comments/dto/comment-response.dto';
import { AttachmentResponseDto } from 'src/attachments/dto/attachment-response.dto';

describe('Attachments (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let taskId: string;
  let commentId: string;
  let attachmentId: string;

  beforeAll(async () => {
    app = await createTestApp();
    accessToken = await getAuthToken(app);

    // Setup: Project -> Task -> Comment
    const proj: { body: ProjectResponseDto } = await request(
      app.getHttpServer(),
    )
      .post('/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Project' });
    const task: { body: TaskResponseDto } = await request(app.getHttpServer())
      .post(`/projects/${proj.body.id}/tasks`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Task' });
    taskId = task.body.id;
    const comm: { body: CommentResponseDto } = await request(
      app.getHttpServer(),
    )
      .post(`/tasks/${taskId}/comments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ content: 'Comment' });
    commentId = comm.body.id;
  });

  it('POST /tasks/:taskId/attachments', async () => {
    const res: { body: AttachmentResponseDto } = await request(
      app.getHttpServer(),
    )
      .post(`/tasks/${taskId}/attachments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.from('test'), 'test.txt')
      .expect(201);
    attachmentId = res.body.id;
  });

  it('POST /comments/:commentId/attachments', () => {
    return request(app.getHttpServer())
      .post(`/comments/${commentId}/attachments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.from('test'), 'test.txt')
      .expect(201);
  });

  it('POST /users/avatar', () => {
    return request(app.getHttpServer())
      .post('/users/avatar')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', Buffer.from('test'), 'avatar.png')
      .expect(201);
  });

  it('GET /tasks/:taskId/attachments', () => {
    return request(app.getHttpServer())
      .get(`/tasks/${taskId}/attachments`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('GET /attachments/:id/download', () => {
    return request(app.getHttpServer())
      .get(`/attachments/${attachmentId}/download`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('DELETE /attachments/:id', () => {
    return request(app.getHttpServer())
      .delete(`/attachments/${attachmentId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });
});
