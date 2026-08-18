import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';

describe('Attachments (e2e)', () => {
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

  it('/attachments/task/:taskId (POST)', () => {
    return request(app.getHttpServer())
      .post('/attachments/task/task-123')
      .attach('file', Buffer.from('test file content'), 'test.txt')
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });
});
