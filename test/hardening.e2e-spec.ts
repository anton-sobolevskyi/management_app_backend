import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  bearer,
  createProject,
  createTask,
  createTestApp,
  PDF,
  registerUser,
  TestUser,
} from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Hardening (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('health and request ids', () => {
    it('GET / is a cheap liveness probe and GET /health checks the database', async () => {
      await http().get('/').expect(200);
      const res = await http().get('/health').expect(200);
      expect(res.body).toEqual({ status: 'ok', database: 'up' });
    });

    it('echoes a safe client request id and replaces an unsafe one', async () => {
      const ok = await http()
        .get('/')
        .set('X-Request-Id', 'trace-abc.123')
        .expect(200);
      expect(ok.headers['x-request-id']).toBe('trace-abc.123');

      const bad = await http()
        .get('/')
        .set('X-Request-Id', 'has spaces <b>')
        .expect(200);
      expect(bad.headers['x-request-id']).toMatch(/^[A-Za-z0-9._-]{1,128}$/);
    });

    it('error bodies carry statusCode, code, message, path and the request id', async () => {
      const user = await registerUser(app);
      const res = await http()
        .get('/projects/00000000-0000-4000-8000-000000000000')
        .set(...bearer(user))
        .set('X-Request-Id', 'req-42')
        .expect(404);

      expect(res.body).toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Project not found',
        requestId: 'req-42',
      });
      expect(res.headers['x-request-id']).toBe('req-42');
    });
  });

  describe('input handling', () => {
    let owner: TestUser;
    let projectId: string;

    beforeAll(async () => {
      owner = await registerUser(app);
      projectId = await createProject(app, owner);
    });

    it('rejects invalid task filters with 400 instead of crashing', async () => {
      for (const query of [
        'status=NOPE',
        'dueBefore=tomorrow',
        'dueAfter=2026-02-31',
        'assignedToId=x',
      ]) {
        const res = await http()
          .get(`/projects/${projectId}/tasks?${query}`)
          .set(...bearer(owner))
          .expect(400);
        expect(res.body.code).toBe('BAD_REQUEST');
      }
    });

    it('bounds free-text fields', async () => {
      await http()
        .post(`/projects/${projectId}/tasks`)
        .set(...bearer(owner))
        .send({ title: 'x'.repeat(201) })
        .expect(400);
      await http()
        .post(`/tasks/${(await createTask(app, owner, projectId)).id}/comments`)
        .set(...bearer(owner))
        .send({ content: 'x'.repeat(5001) })
        .expect(400);
    });

    it('a task due date can be set and then cleared with null', async () => {
      const task = await createTask(app, owner, projectId, {
        dueDate: '2026-12-31T10:00:00Z',
      });
      expect(task.dueDate).toBe('2026-12-31T10:00:00.000Z');

      const cleared = await http()
        .patch(`/tasks/${task.id}`)
        .set(...bearer(owner))
        .send({ dueDate: null })
        .expect(200);
      expect(cleared.body.dueDate).toBeNull();
    });

    it('a date-only dueBefore includes tasks due later that day', async () => {
      const task = await createTask(app, owner, projectId, {
        dueDate: '2030-06-15T18:30:00Z',
      });
      const res = await http()
        .get(
          `/projects/${projectId}/tasks?dueBefore=2030-06-15&dueAfter=2030-06-15T00:00:00Z`,
        )
        .set(...bearer(owner))
        .expect(200);
      expect(res.body.data.map((t: { id: string }) => t.id)).toContain(task.id);
    });

    it('pages never repeat or skip rows, even for tasks created in the same instant', async () => {
      const pid = await createProject(app, owner);
      const sameInstant = new Date();
      await prisma.task
        .createMany({
          data: Array.from({ length: 7 }, (_, i) => ({
            title: `T${i}`,
            projectId: pid,
            createdById: undefined as never,
            createdAt: sameInstant,
          })),
        })
        .catch(async () => {
          // createdById is required: fall back to the API with a shared timestamp
          const me = await prisma.user.findFirst({
            where: { email: owner.email },
          });
          await prisma.task.createMany({
            data: Array.from({ length: 7 }, (_, i) => ({
              title: `T${i}`,
              projectId: pid,
              createdById: me!.id,
              createdAt: sameInstant,
            })),
          });
        });

      const seen: string[] = [];
      for (let page = 1; page <= 4; page++) {
        const res = await http()
          .get(`/projects/${pid}/tasks?page=${page}&limit=2`)
          .set(...bearer(owner))
          .expect(200);
        seen.push(...res.body.data.map((t: { id: string }) => t.id));
      }
      expect(seen).toHaveLength(7);
      expect(new Set(seen).size).toBe(7);
    });
  });

  describe('soft-deleted comments stay hidden', () => {
    it('GET /tasks/:id omits comments that were deleted', async () => {
      const owner = await registerUser(app);
      const projectId = await createProject(app, owner);
      const task = await createTask(app, owner, projectId);
      const keep = await http()
        .post(`/tasks/${task.id}/comments`)
        .set(...bearer(owner))
        .send({ content: 'keep' })
        .expect(201);
      const drop = await http()
        .post(`/tasks/${task.id}/comments`)
        .set(...bearer(owner))
        .send({ content: 'drop' })
        .expect(201);
      await http()
        .delete(`/comments/${drop.body.id}`)
        .set(...bearer(owner))
        .expect(200);

      const detail = await http()
        .get(`/tasks/${task.id}`)
        .set(...bearer(owner))
        .expect(200);
      expect(detail.body.comments.map((c: { id: string }) => c.id)).toEqual([
        keep.body.id,
      ]);
    });
  });

  describe('projects list', () => {
    it('reports memberCount and caps the member preview', async () => {
      const owner = await registerUser(app);
      const a = await registerUser(app);
      const b = await registerUser(app);
      await createProject(app, owner, [{ user: a }, { user: b }]);

      const res = await http()
        .get('/projects')
        .set(...bearer(owner))
        .expect(200);
      const project = res.body.data[0];
      expect(project.memberCount).toBe(3);
      expect(project.members.length).toBeLessThanOrEqual(20);
      expect(project).not.toHaveProperty('_count');
    });
  });

  describe('members', () => {
    it('invites by email regardless of case or stray spaces', async () => {
      const owner = await registerUser(app);
      const invitee = await registerUser(app);
      const projectId = await createProject(app, owner);

      await http()
        .post(`/projects/${projectId}/members`)
        .set(...bearer(owner))
        .send({ email: `  ${invitee.email.toUpperCase()}  `, role: 'MEMBER' })
        .expect(201);
    });

    it('removing a member unassigns their tasks', async () => {
      const owner = await registerUser(app);
      const worker = await registerUser(app);
      const projectId = await createProject(app, owner, [{ user: worker }]);
      const workerId = (
        await http()
          .get('/users/me')
          .set(...bearer(worker))
      ).body.id;
      const task = await createTask(app, owner, projectId, {
        assignedToId: workerId,
      });
      expect(task.assignedToId).toBe(workerId);

      await http()
        .delete(`/projects/${projectId}/members/${workerId}`)
        .set(...bearer(owner))
        .expect(200);

      const after = await http()
        .get(`/tasks/${task.id}`)
        .set(...bearer(owner))
        .expect(200);
      expect(after.body.assignedToId).toBeNull();
    });

    it('two owners demoting each other at once cannot leave the project ownerless', async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        const a = await registerUser(app);
        const b = await registerUser(app);
        const projectId = await createProject(app, a, [
          { user: b, role: 'ADMIN' },
        ]);
        const aId = (
          await http()
            .get('/users/me')
            .set(...bearer(a))
        ).body.id;
        const bId = (
          await http()
            .get('/users/me')
            .set(...bearer(b))
        ).body.id;
        await http()
          .patch(`/projects/${projectId}/members/${bId}`)
          .set(...bearer(a))
          .send({ role: 'OWNER' })
          .expect(200);

        const [r1, r2] = await Promise.all([
          http()
            .patch(`/projects/${projectId}/members/${bId}`)
            .set(...bearer(a))
            .send({ role: 'MEMBER' }),
          http()
            .patch(`/projects/${projectId}/members/${aId}`)
            .set(...bearer(b))
            .send({ role: 'MEMBER' }),
        ]);

        const owners = await prisma.projectMember.count({
          where: { projectId, role: 'OWNER' },
        });
        expect(owners).toBe(1);
        expect([r1.status, r2.status].sort()).toEqual([200, 403]);
      }
    });
  });

  describe('deleting a task cleans up its files', () => {
    it('removes attachment rows and the stored objects, only after the DB change', async () => {
      const owner = await registerUser(app);
      const projectId = await createProject(app, owner);
      const task = await createTask(app, owner, projectId);

      const att = await http()
        .post(`/tasks/${task.id}/attachments`)
        .set(...bearer(owner))
        .attach('file', PDF, {
          filename: 'doc.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);
      const { body } = await http()
        .get(`/attachments/${att.body.id}/download`)
        .set(...bearer(owner))
        .expect(200);
      expect((await fetch(body.url)).status).toBe(200);

      await http()
        .delete(`/tasks/${task.id}`)
        .set(...bearer(owner))
        .expect(200);

      expect(
        await prisma.attachment.count({ where: { id: att.body.id } }),
      ).toBe(0);
      // served before, not served after (S3 stand-ins differ on 403 vs 404)
      expect((await fetch(body.url)).ok).toBe(false);
    });
  });

  describe('changing the password', () => {
    it('verifies the old one, sets the new one and ends every session', async () => {
      const email = `pw-${Date.now()}@example.com`;
      const registered = await http()
        .post('/auth/register')
        .send({ email, password: 'old-pass-1', name: 'Pw' })
        .expect(201);
      const refreshCookie = (
        registered.headers['set-cookie'] as unknown as string[]
      )[0].split(';')[0];
      const user = { accessToken: registered.body.accessToken };

      await http()
        .patch('/users/me/password')
        .set(...bearer(user))
        .send({ currentPassword: 'WRONG-pass-1', newPassword: 'new-pass-2' })
        .expect(400);
      await http()
        .patch('/users/me/password')
        .set(...bearer(user))
        .send({ currentPassword: 'old-pass-1', newPassword: 'old-pass-1' })
        .expect(400);
      await http()
        .patch('/users/me/password')
        .set(...bearer(user))
        .send({ currentPassword: 'old-pass-1', newPassword: 'short' })
        .expect(400);

      await http()
        .patch('/users/me/password')
        .set(...bearer(user))
        .send({ currentPassword: 'old-pass-1', newPassword: 'new-pass-2' })
        .expect(204);

      await http()
        .post('/auth/login')
        .send({ email, password: 'old-pass-1' })
        .expect(401);
      await http()
        .post('/auth/login')
        .send({ email, password: 'new-pass-2' })
        .expect(200);
      await http()
        .post('/auth/refresh')
        .set('Cookie', refreshCookie)
        .expect(401); // old session is dead
    });
  });

  describe('deleting an account', () => {
    it('is refused while sole OWNER of a project with other members, and works after handing over', async () => {
      const owner = await registerUser(app);
      const heir = await registerUser(app);
      const projectId = await createProject(app, owner, [{ user: heir }]);
      const ownerId = (
        await http()
          .get('/users/me')
          .set(...bearer(owner))
      ).body.id;
      const heirId = (
        await http()
          .get('/users/me')
          .set(...bearer(heir))
      ).body.id;

      const refused = await http()
        .delete('/users/me')
        .set(...bearer(owner))
        .send({ currentPassword: owner.password })
        .expect(409);
      expect(refused.body.message).toContain('Test Project');
      await http()
        .get('/users/me')
        .set(...bearer(owner))
        .expect(200); // account untouched

      await http()
        .post(`/projects/${projectId}/members/${heirId}/transfer-ownership`)
        .set(...bearer(owner))
        .expect(201);
      const task = await createTask(app, heir, projectId, {
        assignedToId: ownerId,
      });
      await http()
        .post(`/tasks/${task.id}/comments`)
        .set(...bearer(owner))
        .send({ content: 'bye' })
        .expect(201);

      await http()
        .delete('/users/me')
        .set(...bearer(owner))
        .send({ currentPassword: owner.password })
        .expect(200);

      // gone: token, login and membership; the email can be reused
      await http()
        .get('/users/me')
        .set(...bearer(owner))
        .expect(401);
      await http()
        .post('/auth/login')
        .send({ email: owner.email, password: owner.password })
        .expect(401);
      const members = await http()
        .get(`/projects/${projectId}/members`)
        .set(...bearer(heir))
        .expect(200);
      expect(
        members.body.data.map((m: { userId: string }) => m.userId),
      ).toEqual([heirId]);
      const after = await http()
        .get(`/tasks/${task.id}`)
        .set(...bearer(heir))
        .expect(200);
      expect(after.body.assignedToId).toBeNull();
      await registerUser(app, { email: owner.email });

      // personal data erased
      const row = await prisma.user.findUnique({ where: { id: ownerId } });
      expect(row).toMatchObject({ name: 'Deleted user', avatarId: null });
      expect(row!.email).toMatch(/^deleted\+/);
      expect(row!.passwordHash.startsWith('!')).toBe(true);
    });

    it('takes projects where the user is the only member with it', async () => {
      const solo = await registerUser(app);
      const projectId = await createProject(app, solo);
      await http()
        .delete('/users/me')
        .set(...bearer(solo))
        .send({ currentPassword: solo.password })
        .expect(200);

      const project = await prisma.project.findUnique({
        where: { id: projectId },
      });
      expect(project!.deletedAt).not.toBeNull();
    });

    it('removes the avatar file too', async () => {
      const user = await registerUser(app);
      const png = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.alloc(16),
      ]);
      const avatar = await http()
        .post('/users/avatar')
        .set(...bearer(user))
        .attach('file', png, { filename: 'a.png', contentType: 'image/png' })
        .expect(201);
      const { body } = await http()
        .get(`/attachments/${avatar.body.id}/download`)
        .set(...bearer(user))
        .expect(200);
      expect((await fetch(body.url)).status).toBe(200);

      await http()
        .delete('/users/me')
        .set(...bearer(user))
        .send({ currentPassword: user.password })
        .expect(200);

      expect(
        await prisma.attachment.count({ where: { id: avatar.body.id } }),
      ).toBe(0);
      expect((await fetch(body.url)).ok).toBe(false);
    });
  });
});
