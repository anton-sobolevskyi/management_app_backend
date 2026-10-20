import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, registerUser, TestUser } from './helpers';

describe('Authorization (e2e)', () => {
  let app: INestApplication;
  let owner: TestUser;
  let outsider: TestUser;
  let member: TestUser;
  let projectId: string;
  let taskId: string;
  let commentId: string;

  beforeAll(async () => {
    app = await createTestApp();
    owner = await registerUser(app, { name: 'Owner' });
    outsider = await registerUser(app, { name: 'Outsider' });
    member = await registerUser(app, { name: 'Member' });

    const project = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Authz Project', description: 'e2e' })
      .expect(201);

    projectId = project.body.id;

    const task = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'Authz Task' })
      .expect(201);

    taskId = task.body.id;

    const comment = await request(app.getHttpServer())
      .post(`/tasks/${taskId}/comments`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ content: 'Owner comment' })
      .expect(201);

    commentId = comment.body.id;

    // Add member to the project
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ email: member.email, role: 'MEMBER' })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('non-member access', () => {
    it('returns 404 for foreign project', () => {
      return request(app.getHttpServer())
        .get(`/projects/${projectId}`)
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .expect(404);
    });

    it('returns 404 when creating a task on foreign project', () => {
      return request(app.getHttpServer())
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .send({ title: 'Hijack' })
        .expect(404);
    });

    it('returns 404 for foreign task', () => {
      return request(app.getHttpServer())
        .get(`/tasks/${taskId}`)
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .expect(404);
    });

    it('returns 404 for foreign comment', () => {
      return request(app.getHttpServer())
        .get(`/comments/${commentId}`)
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .expect(404);
    });
  });

  describe('role restrictions', () => {
    it('MEMBER cannot update project (403)', () => {
      return request(app.getHttpServer())
        .patch(`/projects/${projectId}`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .send({ name: 'Hacked' })
        .expect(403);
    });

    it('MEMBER cannot delete project (403)', () => {
      return request(app.getHttpServer())
        .delete(`/projects/${projectId}`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .expect(403);
    });

    it('MEMBER can read project', () => {
      return request(app.getHttpServer())
        .get(`/projects/${projectId}`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .expect(200);
    });

    it('MEMBER cannot soft-delete task (403)', () => {
      return request(app.getHttpServer())
        .delete(`/tasks/${taskId}`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .expect(403);
    });

    it('MEMBER cannot edit owner comment (403)', () => {
      return request(app.getHttpServer())
        .patch(`/comments/${commentId}`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .send({ content: 'Nope' })
        .expect(403);
    });

    it('OWNER can edit own comment', () => {
      return request(app.getHttpServer())
        .patch(`/comments/${commentId}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ content: 'Updated by owner' })
        .expect(200);
    });
  });

  describe('project members API', () => {
    it('lists members for a project member', async () => {
      const res = await request(app.getHttpServer())
        .get(`/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(2);
    });

    it('MEMBER cannot add members (403)', () => {
      return request(app.getHttpServer())
        .post(`/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .send({ email: outsider.email, role: 'MEMBER' })
        .expect(403);
    });

    it('OWNER can add ADMIN and ADMIN can update project', async () => {
      const admin = await registerUser(app, { name: 'Admin' });

      await request(app.getHttpServer())
        .post(`/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ email: admin.email, role: 'ADMIN' })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/projects/${projectId}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ name: 'Updated by admin' })
        .expect(200);

      // ADMIN still cannot delete project
      await request(app.getHttpServer())
        .delete(`/projects/${projectId}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(403);
    });

    it('cannot remove the last OWNER', async () => {
      // Resolve owner userId from members list
      const res = await request(app.getHttpServer())
        .get(`/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);

      const ownerMember = res.body.find(
        (m: { role: string }) => m.role === 'OWNER',
      );
      expect(ownerMember).toBeDefined();

      await request(app.getHttpServer())
        .delete(`/projects/${projectId}/members/${ownerMember.userId}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(403);
    });

    it('OWNER can remove a MEMBER', async () => {
      const disposable = await registerUser(app, { name: 'Disposable' });

      const added = await request(app.getHttpServer())
        .post(`/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ email: disposable.email, role: 'MEMBER' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/projects/${projectId}/members/${added.body.userId}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);

      // Removed user no longer sees the project
      await request(app.getHttpServer())
        .get(`/projects/${projectId}`)
        .set('Authorization', `Bearer ${disposable.accessToken}`)
        .expect(404);
    });
  });
});
