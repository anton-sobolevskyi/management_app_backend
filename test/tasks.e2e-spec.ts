import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, getAuthToken } from './helpers';
import { ProjectResponseDto } from '../src/projects/dto/project-response.dto';

describe('Tasks (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let projectId: string;

  beforeAll(async () => {
    app = await createTestApp();
    accessToken = await getAuthToken(app);

    const proj: { body: ProjectResponseDto } = await request(
      app.getHttpServer(),
    )
      .post('/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Project' });
    projectId = proj.body.id;
  });

  it('/tasks (POST)', () => {
    return request(app.getHttpServer())
      .post('/projects/' + projectId + '/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'New Task' })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });
});
