import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers';

const cookieOf = (res: request.Response) =>
  ((res.headers['set-cookie'] as unknown as string[] | undefined) ?? []).find(
    (c) => c.startsWith('refreshToken='),
  );
const pair = (setCookie: string) => setCookie.split(';')[0];

describe('Auth (e2e)', () => {
  let app: INestApplication;
  const email = `auth-${Date.now()}@example.com`;
  const password = 'password1';

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('registers: access token + expiresIn in the body, refresh token only in an HttpOnly cookie', async () => {
    const res = await http()
      .post('/auth/register')
      .send({ email, password, name: 'New User' })
      .expect(201);

    expect(Object.keys(res.body).sort()).toEqual(['accessToken', 'expiresIn']);
    expect(res.body.expiresIn).toBe(900);
    const cookie = cookieOf(res)!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Path=\/auth/);
  });

  it('rejects a duplicate email regardless of case or surrounding spaces', async () => {
    const res = await http()
      .post('/auth/register')
      .send({ email: `  ${email.toUpperCase()} `, password, name: 'Dup' })
      .expect(409);
    expect(res.body).toMatchObject({ statusCode: 409, code: 'CONFLICT' });
  });

  it('logs in with a differently-cased email', async () => {
    const res = await http()
      .post('/auth/login')
      .send({ email: email.toUpperCase(), password })
      .expect(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(cookieOf(res)).toBeDefined();
  });

  it('rejects a wrong password and an unknown email identically', async () => {
    const wrong = await http()
      .post('/auth/login')
      .send({ email, password: 'nope-nope1' })
      .expect(401);
    const unknown = await http()
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password })
      .expect(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it('rejects over-long input before hashing it (bcrypt only reads 72 bytes)', async () => {
    const res = await http()
      .post('/auth/register')
      .send({
        email: `long-${Date.now()}@example.com`,
        password: 'a1'.repeat(40),
        name: 'Long',
      })
      .expect(400);
    expect(JSON.stringify(res.body.message)).toMatch(/72 bytes/);
  });

  describe('refresh-token lifecycle', () => {
    let login: request.Response;

    beforeEach(async () => {
      login = await http()
        .post('/auth/login')
        .send({ email, password })
        .expect(200);
    });

    it('refreshes immediately after login (same second) with a rotated cookie', async () => {
      const refreshed = await http()
        .post('/auth/refresh')
        .set('Cookie', pair(cookieOf(login)!))
        .expect(200);

      expect(refreshed.body.accessToken).toEqual(expect.any(String));
      expect(pair(cookieOf(refreshed)!)).not.toEqual(pair(cookieOf(login)!));
    });

    it('replaying a rotated token ends every session', async () => {
      const original = pair(cookieOf(login)!);
      const rotated = await http()
        .post('/auth/refresh')
        .set('Cookie', original)
        .expect(200);

      await http().post('/auth/refresh').set('Cookie', original).expect(401);
      await http()
        .post('/auth/refresh')
        .set('Cookie', pair(cookieOf(rotated)!))
        .expect(401);
    });

    it('lets exactly one of two concurrent refreshes through', async () => {
      const cookie = pair(cookieOf(login)!);
      const [a, b] = await Promise.all([
        http().post('/auth/refresh').set('Cookie', cookie),
        http().post('/auth/refresh').set('Cookie', cookie),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 401]);
    });

    it('logout clears the cookie with the original path and kills the token', async () => {
      const cookie = pair(cookieOf(login)!);
      const res = await http()
        .post('/auth/logout')
        .set('Cookie', cookie)
        .expect(201);

      expect(cookieOf(res)).toMatch(/Path=\/auth/);
      expect(cookieOf(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
      await http().post('/auth/refresh').set('Cookie', cookie).expect(401);
    });

    it('refuses refresh/logout from an untrusted Origin (CSRF)', async () => {
      const cookie = pair(cookieOf(login)!);
      await http()
        .post('/auth/refresh')
        .set('Cookie', cookie)
        .set('Origin', 'https://evil.example')
        .expect(403);
      await http()
        .post('/auth/logout')
        .set('Cookie', cookie)
        .set('Origin', 'https://evil.example')
        .expect(403);
    });

    it('401s without a cookie, in the standard error shape', async () => {
      const res = await http().post('/auth/refresh').expect(401);
      expect(res.body).toMatchObject({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'No refresh token provided',
        path: '/auth/refresh',
      });
      expect(res.body.requestId).toEqual(expect.any(String));
    });
  });
});
