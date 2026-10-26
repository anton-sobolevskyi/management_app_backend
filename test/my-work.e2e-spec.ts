import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  bearer,
  createProject,
  createTask,
  createTestApp,
  PNG,
  registerUser,
  TestUser,
} from './helpers';

type Page<T> = { data: T[]; meta: { total: number } };
type TaskRow = {
  id: string;
  title: string;
  project?: { id: string; name: string };
};

describe('Comment files, my work and project progress (e2e)', () => {
  let app: INestApplication;
  let owner: TestUser;
  let member: TestUser;
  let memberId: string;
  let projectId: string;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    owner = await registerUser(app, { name: 'Owner' });
    member = await registerUser(app, { name: 'Member' });
    projectId = await createProject(app, owner, [{ user: member }]);

    const me = await http()
      .get('/users/me')
      .set(...bearer(member))
      .expect(200);
    memberId = (me.body as { id: string }).id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('comments keep their author and files', () => {
    let taskId: string;
    let commentId: string;

    beforeAll(async () => {
      taskId = (
        await createTask(app, owner, projectId, { title: 'With files' })
      ).id;
    });

    it('returns the author (and no files yet) when a comment is created', async () => {
      const res = await http()
        .post(`/tasks/${taskId}/comments`)
        .set(...bearer(owner))
        .send({ content: 'See the screenshot' })
        .expect(201);
      const body = res.body as {
        id: string;
        author: { name: string };
        attachments: unknown[];
      };
      commentId = body.id;
      expect(body.author.name).toBe('Owner');
      expect(body.attachments).toEqual([]);
    });

    it('lists attachments with the comment, without storage keys', async () => {
      await http()
        .post(`/comments/${commentId}/attachments`)
        .set(...bearer(owner))
        .attach('file', PNG, { filename: 'shot.png', contentType: 'image/png' })
        .expect(201);

      const res = await http()
        .get(`/tasks/${taskId}/comments`)
        .set(...bearer(owner))
        .expect(200);
      const comment = (
        res.body as Page<{ id: string; attachments: Record<string, unknown>[] }>
      ).data.find((c) => c.id === commentId);
      expect(comment?.attachments).toHaveLength(1);
      expect(comment?.attachments[0]).toMatchObject({ fileName: 'shot.png' });
      expect(comment?.attachments[0]).not.toHaveProperty('s3Key');
    });

    it('keeps author and files when the comment is edited', async () => {
      const res = await http()
        .patch(`/comments/${commentId}`)
        .set(...bearer(owner))
        .send({ content: 'See the screenshot (edited)' })
        .expect(200);
      const body = res.body as {
        author?: { name: string };
        attachments?: unknown[];
      };
      expect(body.author?.name).toBe('Owner');
      expect(body.attachments).toHaveLength(1);
    });
  });

  describe('GET /users/me/tasks', () => {
    let doneTaskId: string;

    beforeAll(async () => {
      await createTask(app, owner, projectId, {
        title: 'Due later',
        assignedToId: memberId,
        dueDate: '2026-12-20',
      });
      await createTask(app, owner, projectId, {
        title: 'Due soon',
        assignedToId: memberId,
        dueDate: '2026-11-05',
      });
      await createTask(app, owner, projectId, {
        title: 'No due date',
        assignedToId: memberId,
      });
      doneTaskId = (
        await createTask(app, owner, projectId, {
          title: 'Already done',
          assignedToId: memberId,
        })
      ).id;
      await http()
        .patch(`/tasks/${doneTaskId}`)
        .set(...bearer(owner))
        .send({ status: 'DONE' })
        .expect(200);
      await createTask(app, owner, projectId, { title: 'Not for member' });
    });

    it('requires authentication', async () => {
      await http().get('/users/me/tasks').expect(401);
    });

    it('lists open tasks assigned to me, soonest due first, with the project', async () => {
      const res = await http()
        .get('/users/me/tasks')
        .set(...bearer(member))
        .expect(200);
      const page = res.body as Page<TaskRow>;
      expect(page.data.map((t) => t.title)).toEqual([
        'Due soon',
        'Due later',
        'No due date',
      ]);
      expect(page.meta.total).toBe(3);
      expect(page.data[0].project).toMatchObject({ id: projectId });
    });

    it('includes finished tasks only when asked', async () => {
      const res = await http()
        .get('/users/me/tasks?includeDone=true')
        .set(...bearer(member))
        .expect(200);
      expect((res.body as Page<TaskRow>).data.map((t) => t.title)).toContain(
        'Already done',
      );
    });

    it("never shows other people's tasks", async () => {
      const res = await http()
        .get('/users/me/tasks')
        .set(...bearer(owner))
        .expect(200);
      expect((res.body as Page<TaskRow>).meta.total).toBe(0);
    });
  });

  describe('GET /projects progress counts', () => {
    it('reports total and finished tasks per project', async () => {
      const res = await http()
        .get('/projects')
        .set(...bearer(owner))
        .expect(200);
      const project = (
        res.body as Page<{
          id: string;
          taskCount: number;
          doneTaskCount: number;
        }>
      ).data.find((p) => p.id === projectId);
      // 1 task from the comments block + 5 from the my-tasks block, 1 of them DONE
      expect(project?.taskCount).toBe(6);
      expect(project?.doneTaskCount).toBe(1);
    });
  });
});
