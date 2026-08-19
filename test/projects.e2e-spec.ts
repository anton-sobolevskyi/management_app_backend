import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, getAuthToken } from './helpers';
import { ProjectResponseDto } from '../src/projects/dto/project-response.dto';

describe('Projects (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let projectId: string;

  beforeAll(async () => {
    app = await createTestApp();
    accessToken = await getAuthToken(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /projects', async () => {
    const res: { body: ProjectResponseDto } = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'New Project', description: 'Test Description' })
      .expect(201);
    projectId = res.body.id;
  });

  it('GET /projects', () => {
    return request(app.getHttpServer())
      .get('/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('GET /projects/:id', () => {
    return request(app.getHttpServer())
      .get(`/projects/${projectId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('PATCH /projects/:id', () => {
    return request(app.getHttpServer())
      .patch(`/projects/${projectId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Updated Project' })
      .expect(200);
  });

  it('DELETE /projects/:id', () => {
    return request(app.getHttpServer())
      .delete(`/projects/${projectId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });
});
