import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  bearer,
  createProject,
  createTask,
  createTestApp,
  PNG,
  registerUser,
  TEXT,
  TestUser,
} from './helpers';

/**
 * Walks the JSON of every kind of response and fails if a secret or internal
 * field shows up anywhere in it, however deeply nested. Complements the
 * unit-level drift guard (src/common/exposed-fields.spec.ts) by checking what
 * the API really sends.
 */
const FORBIDDEN_KEYS = [
  'passwordHash',
  'tokenVersion',
  'tokenHash',
  's3Key',
  's3Bucket',
  'refreshToken',
];

function forbiddenPaths(value: unknown, path = '$'): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => forbiddenPaths(v, `${path}[${i}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, v]) => [
      ...(FORBIDDEN_KEYS.includes(key) ? [`${path}.${key}`] : []),
      ...forbiddenPaths(v, `${path}.${key}`),
    ]);
  }
  return [];
}

describe('No secrets in responses (e2e)', () => {
  let app: INestApplication;
  let owner: TestUser;
  let member: TestUser;
  let projectId: string;
  let taskId: string;
  let commentId: string;

  const http = () => request(app.getHttpServer());
  const responses: Record<string, unknown> = {};

  beforeAll(async () => {
    app = await createTestApp();
    owner = await registerUser(app);
    member = await registerUser(app);
    projectId = await createProject(app, owner, [{ user: member }]);
    taskId = (await createTask(app, owner, projectId)).id;

    await http()
      .post('/users/avatar')
      .set(...bearer(member))
      .attach('file', PNG, { filename: 'me.png', contentType: 'image/png' })
      .expect(201);

    const comment = await http()
      .post(`/tasks/${taskId}/comments`)
      .set(...bearer(member))
      .send({ content: 'hello' })
      .expect(201);
    commentId = comment.body.id;

    const file = await http()
      .post(`/tasks/${taskId}/attachments`)
      .set(...bearer(member))
      .attach('file', TEXT, { filename: 'a.txt', contentType: 'text/plain' })
      .expect(201);
    responses['upload to task'] = file.body;

    const onComment = await http()
      .post(`/comments/${commentId}/attachments`)
      .set(...bearer(member))
      .attach('file', TEXT, { filename: 'b.txt', contentType: 'text/plain' })
      .expect(201);
    responses['upload to comment'] = onComment.body;

    const get = async (name: string, url: string, who: TestUser) => {
      const res = await http()
        .get(url)
        .set(...bearer(who))
        .expect(200);
      responses[name] = res.body;
    };

    await get('GET /users/me', '/users/me', member);
    await get('GET /projects', '/projects', owner);
    await get('GET /projects/:id', `/projects/${projectId}`, owner);
    await get('GET members', `/projects/${projectId}/members`, owner);
    await get('GET project tasks', `/projects/${projectId}/tasks`, owner);
    await get('GET /tasks/:id', `/tasks/${taskId}`, owner);
    await get('GET task comments', `/tasks/${taskId}/comments`, owner);
    await get('GET /comments/:id', `/comments/${commentId}`, owner);
    await get('GET task attachments', `/tasks/${taskId}/attachments`, owner);
  });

  afterAll(async () => {
    await app.close();
  });

  it('auth responses carry only the access token', async () => {
    const email = `scan-${Date.now()}@example.com`;
    const fresh = await http()
      .post('/auth/register')
      .send({ email, password: 'password1', name: 'Scan' })
      .expect(201);
    const login = await http()
      .post('/auth/login')
      .send({ email, password: 'password1' })
      .expect(200);

    expect(forbiddenPaths(fresh.body)).toEqual([]);
    expect(forbiddenPaths(login.body)).toEqual([]);
    // the refresh token travels in an httpOnly cookie, never in the body
    expect(login.body).not.toHaveProperty('refreshToken');
  });

  it('read and write endpoints expose no secret or internal field', () => {
    // guard against the scan silently checking nothing
    expect(Object.keys(responses).length).toBeGreaterThanOrEqual(11);

    const leaks = Object.entries(responses).flatMap(([name, body]) =>
      forbiddenPaths(body).map((p) => `${name}: ${p}`),
    );
    expect(leaks).toEqual([]);
  });
});
