import { INestApplication } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AllExceptionsFilter } from '../common/filters/all-exceptions.filter';

/**
 * HTTP-level checks of the refresh-token flow: real controller, guards, cookie
 * handling and JWT signing, with an in-memory stand-in for Prisma that enforces
 * the same UNIQUE(token) constraint as the database.
 */
type Row = {
  id: string;
  token: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  revoked: boolean;
  revokedAt: Date | null;
};

function createFakePrisma() {
  const rows: Row[] = [];
  const user = { id: 'u1', email: 'a@b.c', deletedAt: null, tokenVersion: 0 };
  let seq = 0;

  const matches = (row: Row, where: Partial<Row>) =>
    Object.entries(where).every(([k, v]) => row[k as keyof Row] === v);

  return {
    rows,
    user: {
      findFirst: () => Promise.resolve(null),
      create: () => Promise.resolve(user),
    },
    refreshToken: {
      create: ({
        data,
      }: {
        data: Omit<Row, 'id' | 'createdAt' | 'revoked' | 'revokedAt'>;
      }) => {
        if (rows.some((r) => r.token === data.token)) {
          return Promise.reject(
            Object.assign(new Error('Unique constraint failed'), {
              name: 'PrismaClientKnownRequestError',
              code: 'P2002',
            }),
          );
        }
        const row: Row = {
          ...data,
          id: `rt-${++seq}`,
          createdAt: new Date(),
          revoked: false,
          revokedAt: null,
        };
        rows.push(row);
        return Promise.resolve(row);
      },
      findUnique: ({ where }: { where: { token: string } }) => {
        const row = rows.find((r) => r.token === where.token);
        return Promise.resolve(row ? { ...row, user } : null);
      },
      updateMany: ({
        where,
        data,
      }: {
        where: Partial<Row>;
        data: Partial<Row>;
      }) => {
        const hit = rows.filter((r) => matches(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return Promise.resolve({ count: hit.length });
      },
      deleteMany: () => Promise.resolve({ count: 0 }),
    },
  };
}

describe('Auth refresh flow over HTTP', () => {
  let app: INestApplication;
  let fake: ReturnType<typeof createFakePrisma>;
  const env = { ...process.env };

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'access-secret';
    process.env.NODE_ENV = 'test';
    process.env.FRONTEND_URL = 'https://app.example.com';
    fake = createFakePrisma();

    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      controllers: [AuthController],
      providers: [AuthService, { provide: PrismaService, useValue: fake }],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    process.env = env;
  });

  const cookieOf = (res: request.Response, name = 'refreshToken') => {
    const header = (res.headers['set-cookie'] as unknown as string[]) ?? [];
    return header.find((c) => c.startsWith(`${name}=`));
  };
  const pair = (setCookie: string) => setCookie.split(';')[0];

  it('keeps the refresh token out of the body and in an HttpOnly /auth cookie', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'a@b.c', password: 'password1', name: 'Test' })
      .expect(201);

    expect(Object.keys(res.body).sort()).toEqual(['accessToken', 'expiresIn']);
    expect(res.body.expiresIn).toBe(900);
    const cookie = cookieOf(res)!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Path=\/auth/);
    expect(cookie).toMatch(/SameSite=Lax/);
  });

  it('refreshes immediately after login (same-second tokens no longer collide) and answers 200', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'a@b.c', password: 'password1', name: 'Test' })
      .expect(201);

    const refreshed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', pair(cookieOf(login)!))
      .expect(200);

    expect(refreshed.body).toEqual({
      accessToken: expect.any(String),
      expiresIn: 900,
    });
    expect(pair(cookieOf(refreshed)!)).not.toEqual(pair(cookieOf(login)!));
  });

  it('lets exactly one of two concurrent refreshes through', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'a@b.c', password: 'password1', name: 'Test' });
    const cookie = pair(cookieOf(login)!);

    const [a, b] = await Promise.all([
      request(app.getHttpServer()).post('/auth/refresh').set('Cookie', cookie),
      request(app.getHttpServer()).post('/auth/refresh').set('Cookie', cookie),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 401]);
  });

  it('only rejects a just-rotated token (second tab) without killing the session', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'a@b.c', password: 'password1', name: 'Test' });
    const original = pair(cookieOf(login)!);

    const rotated = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', original)
      .expect(200);
    const current = pair(cookieOf(rotated)!);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', original)
      .expect(401);

    // inside the grace window the newest token keeps working
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', current)
      .expect(200);
  });

  it('revokes every session when a rotated token is replayed after the grace window', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'a@b.c', password: 'password1', name: 'Test' });
    const original = pair(cookieOf(login)!);

    const rotated = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', original)
      .expect(200);
    const current = pair(cookieOf(rotated)!);

    // pretend the rotation happened a minute ago
    fake.rows
      .filter((r) => r.revoked)
      .forEach((r) => (r.revokedAt = new Date(Date.now() - 60_000)));

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', original)
      .expect(401);

    // the legitimate, newest token is dead too
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', current)
      .expect(401);
  });

  it('logout clears the cookie with the same path it was set with', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'a@b.c', password: 'password1', name: 'Test' });
    const cookie = pair(cookieOf(login)!);

    const res = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', cookie)
      .expect(201);

    const cleared = cookieOf(res)!;
    expect(cleared).toMatch(/^refreshToken=;/);
    expect(cleared).toMatch(/Path=\/auth/); // was missing: browser kept the cookie
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', cookie)
      .expect(401);
  });

  it('rejects refresh/logout from an untrusted Origin but allows the frontend', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'a@b.c', password: 'password1', name: 'Test' });
    const cookie = pair(cookieOf(login)!);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', cookie)
      .set('Origin', 'https://evil.example')
      .expect(403);
    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', cookie)
      .set('Origin', 'https://evil.example')
      .expect(403);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', cookie)
      .set('Origin', 'https://app.example.com')
      .expect(200);
  });

  it('returns 401 JSON in the standard error shape when the cookie is missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .expect(401);
    expect(res.body).toMatchObject({
      statusCode: 401,
      message: 'No refresh token provided',
      path: '/auth/refresh',
    });
  });
});
