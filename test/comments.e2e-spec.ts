import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';

describe('Comments (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/tasks/:taskId/comments (POST)', () => {
    return request(app.getHttpServer())
      .post('/tasks/task-123/comments')
      .send({ content: 'This is a test comment' })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });
});
