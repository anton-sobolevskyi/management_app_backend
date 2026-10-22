import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  bearer,
  createProject,
  createTask,
  createTestApp,
  HTML,
  JPEG,
  PDF,
  PNG,
  registerUser,
  TEXT,
  TestUser,
} from './helpers';

describe('Attachments (e2e)', () => {
  let app: INestApplication;
  let owner: TestUser;
  let admin: TestUser;
  let member: TestUser;
  let otherMember: TestUser;
  let stranger: TestUser;
  let projectId: string;
  let taskId: string;
  let commentId: string; // written by `member`

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    [owner, admin, member, otherMember, stranger] = await Promise.all([
      registerUser(app, { name: 'Owner' }),
      registerUser(app, { name: 'Admin' }),
      registerUser(app, { name: 'Member' }),
      registerUser(app, { name: 'Other' }),
      registerUser(app, { name: 'Stranger' }),
    ]);
    projectId = await createProject(app, owner, [
      { user: admin, role: 'ADMIN' },
      { user: member },
      { user: otherMember },
    ]);
    taskId = (await createTask(app, owner, projectId)).id;
    const comment = await http()
      .post(`/tasks/${taskId}/comments`)
      .set(...bearer(member))
      .send({ content: 'Written by member' })
      .expect(201);
    commentId = comment.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const uploadToTask = (
    user: TestUser,
    buf = TEXT,
    name = 'note.txt',
    type = 'text/plain',
  ) =>
    http()
      .post(`/tasks/${taskId}/attachments`)
      .set(...bearer(user))
      .attach('file', buf, { filename: name, contentType: type });

  describe('uploading to a task', () => {
    it('stores the file and never returns storage coordinates', async () => {
      const res = await uploadToTask(member).expect(201);

      expect(res.body).toMatchObject({
        fileName: 'note.txt',
        mimeType: 'text/plain',
        taskId,
      });
      expect(res.body).not.toHaveProperty('s3Key');
      expect(res.body).not.toHaveProperty('s3Bucket');
    });

    it('does not leak storage coordinates through the list or the task detail either', async () => {
      const list = await http()
        .get(`/tasks/${taskId}/attachments`)
        .set(...bearer(member))
        .expect(200);
      const detail = await http()
        .get(`/tasks/${taskId}`)
        .set(...bearer(member))
        .expect(200);

      for (const a of [...list.body, ...detail.body.attachments]) {
        expect(a).not.toHaveProperty('s3Key');
        expect(a).not.toHaveProperty('s3Bucket');
      }
      expect(detail.body.attachments.length).toBeGreaterThan(0);
    });

    it('accepts real images and PDFs', async () => {
      await uploadToTask(member, PNG, 'p.png', 'image/png').expect(201);
      await uploadToTask(member, JPEG, 'p.jpg', 'image/jpeg').expect(201);
      await uploadToTask(member, PDF, 'p.pdf', 'application/pdf').expect(201);
    });

    it('rejects content that is not what its Content-Type claims', async () => {
      const res = await uploadToTask(
        member,
        HTML,
        'evil.jpg',
        'image/jpeg',
      ).expect(400);
      expect(res.body.message).toMatch(/does not match/);
      await uploadToTask(member, PNG, 'x.txt', 'text/plain').expect(400);
    });

    it('rejects disallowed types and empty files', async () => {
      await uploadToTask(
        member,
        TEXT,
        'a.exe',
        'application/x-msdownload',
      ).expect(400);
      await uploadToTask(
        member,
        Buffer.alloc(0),
        'empty.txt',
        'text/plain',
      ).expect(400);
    });

    it('keeps a non-ASCII file name intact (utf-8, not latin1 mojibake)', async () => {
      const res = await uploadToTask(member, TEXT, 'звіт квітень.txt').expect(
        201,
      );
      expect(res.body.fileName).toBe('звіт квітень.txt');
    });

    it('is not available to non-members (404)', async () => {
      await uploadToTask(stranger).expect(404);
    });
  });

  describe('downloading', () => {
    it('forces a download with the original name for documents', async () => {
      const att = (
        await uploadToTask(
          member,
          PDF,
          'квартальний звіт.pdf',
          'application/pdf',
        ).expect(201)
      ).body;

      const res = await http()
        .get(`/attachments/${att.id}/download`)
        .set(...bearer(otherMember))
        .expect(200);

      const url = new URL(res.body.url);
      const disposition = url.searchParams.get('response-content-disposition')!;
      expect(disposition).toMatch(/^attachment;/);
      expect(disposition).toContain("filename*=UTF-8''%D0%BA%D0%B2");
    });

    it('serves images inline', async () => {
      const att = (
        await uploadToTask(member, PNG, 'pic.png', 'image/png').expect(201)
      ).body;
      const res = await http()
        .get(`/attachments/${att.id}/download`)
        .set(...bearer(member))
        .expect(200);
      expect(
        new URL(res.body.url).searchParams.get('response-content-disposition'),
      ).toMatch(/^inline;/);
    });

    it('the signed URL really serves the uploaded bytes', async () => {
      const att = (
        await uploadToTask(member, PDF, 'real.pdf', 'application/pdf').expect(
          201,
        )
      ).body;
      const { body } = await http()
        .get(`/attachments/${att.id}/download`)
        .set(...bearer(member))
        .expect(200);

      const file = await fetch(body.url);
      expect(file.status).toBe(200);
      expect(Buffer.from(await file.arrayBuffer()).equals(PDF)).toBe(true);
    });

    it('404s for non-members', async () => {
      const att = (await uploadToTask(member).expect(201)).body;
      await http()
        .get(`/attachments/${att.id}/download`)
        .set(...bearer(stranger))
        .expect(404);
    });
  });

  describe('deleting: uploader or project admin only', () => {
    let attachmentId: string;

    beforeEach(async () => {
      attachmentId = (await uploadToTask(member).expect(201)).body.id;
    });

    it("a plain member cannot delete someone else's attachment (403)", async () => {
      await http()
        .delete(`/attachments/${attachmentId}`)
        .set(...bearer(otherMember))
        .expect(403);
    });

    it('the uploader can', async () => {
      await http()
        .delete(`/attachments/${attachmentId}`)
        .set(...bearer(member))
        .expect(200);
    });

    it.each([['owner'], ['admin']])('a project %s can', async (who) => {
      const user = who === 'owner' ? owner : admin;
      await http()
        .delete(`/attachments/${attachmentId}`)
        .set(...bearer(user))
        .expect(200);
    });

    it('non-members get 404', async () => {
      await http()
        .delete(`/attachments/${attachmentId}`)
        .set(...bearer(stranger))
        .expect(404);
    });
  });

  describe('attachments on comments follow the comment rule (author or admin)', () => {
    const uploadToComment = (user: TestUser) =>
      http()
        .post(`/comments/${commentId}/attachments`)
        .set(...bearer(user))
        .attach('file', TEXT, { filename: 'c.txt', contentType: 'text/plain' });

    it("another member cannot attach to someone else's comment (403)", async () => {
      await uploadToComment(otherMember).expect(403);
    });

    it('the comment author can', async () => {
      await uploadToComment(member).expect(201);
    });

    it('a project admin can', async () => {
      await uploadToComment(admin).expect(201);
    });

    it('non-members get 404', async () => {
      await uploadToComment(stranger).expect(404);
    });
  });

  describe('avatars', () => {
    let avatarId: string;

    beforeAll(async () => {
      const res = await http()
        .post('/users/avatar')
        .set(...bearer(member))
        .attach('file', PNG, { filename: 'me.png', contentType: 'image/png' })
        .expect(201);
      avatarId = res.body.id;
    });

    it('only images are accepted', async () => {
      await http()
        .post('/users/avatar')
        .set(...bearer(member))
        .attach('file', PDF, {
          filename: 'a.pdf',
          contentType: 'application/pdf',
        })
        .expect(400);
    });

    it('the owner can read their avatar', async () => {
      await http()
        .get(`/attachments/${avatarId}/download`)
        .set(...bearer(member))
        .expect(200);
    });

    it('a teammate (shared project) can read it — previously a 404', async () => {
      await http()
        .get(`/attachments/${avatarId}/download`)
        .set(...bearer(otherMember))
        .expect(200);
    });

    it('someone who shares no project cannot (404)', async () => {
      await http()
        .get(`/attachments/${avatarId}/download`)
        .set(...bearer(stranger))
        .expect(404);
    });

    it('teammates cannot delete it, not even the project owner (403)', async () => {
      await http()
        .delete(`/attachments/${avatarId}`)
        .set(...bearer(otherMember))
        .expect(403);
      await http()
        .delete(`/attachments/${avatarId}`)
        .set(...bearer(owner))
        .expect(403);
    });

    it('uploading a new avatar replaces the old one', async () => {
      await http()
        .post('/users/avatar')
        .set(...bearer(member))
        .attach('file', JPEG, {
          filename: 'new.jpg',
          contentType: 'image/jpeg',
        })
        .expect(201);

      // the old attachment is gone
      await http()
        .get(`/attachments/${avatarId}/download`)
        .set(...bearer(member))
        .expect(404);
      const me = await http()
        .get('/users/me')
        .set(...bearer(member))
        .expect(200);
      expect(me.body.avatarId).not.toBe(avatarId);
    });
  });
});
