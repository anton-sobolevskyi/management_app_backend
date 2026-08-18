import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { getAuthToken } from './test-utils';

describe('Projects (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    accessToken = await getAuthToken(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('/projects (POST)', () => {
    return request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'New Project', description: 'Test Description' })
      .expect(201)
      .expect((res) => {
        expect(res.body.name).toBe('New Project');
      });
  });

  it('/projects (GET)', () => {
    return request(app.getHttpServer())
      .get('/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body)).toBe(true);
      });
  });
});
