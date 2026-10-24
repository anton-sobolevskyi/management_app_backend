import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MailService } from '../src/mail/mail.service';
import {
  bearer,
  createProject,
  createTestApp,
  registerUser,
  verifyEmail,
} from './helpers';

describe('Account security (e2e)', () => {
  let app: INestApplication;
  let mail: MailService;

  beforeAll(async () => {
    app = await createTestApp();
    mail = app.get(MailService);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  async function waitForMail(to: string, subject: RegExp) {
    for (let i = 0; i < 50; i++) {
      const msg = mail.outbox.find(
        (m) => m.to === to && subject.test(m.subject),
      );
      if (msg) return msg;
      await new Promise((r) => setTimeout(r, 40));
    }
    throw new Error(`No e-mail to ${to} matching ${subject}`);
  }

  describe('re-authentication for sensitive changes', () => {
    it('changes the name without a password', async () => {
      const user = await registerUser(app);
      await http()
        .patch('/users/me')
        .set(...bearer(user))
        .send({ name: 'Renamed' })
        .expect(200);
    });

    it('refuses an e-mail change without the current password', async () => {
      const user = await registerUser(app);
      const newEmail = `new-${Date.now()}@example.com`;

      await http()
        .patch('/users/me')
        .set(...bearer(user))
        .send({ email: newEmail })
        .expect(400);

      const profile = await http()
        .get('/users/me')
        .set(...bearer(user));
      expect(profile.body.email).toBe(user.email);
    });

    it('refuses an e-mail change with a wrong password', async () => {
      const user = await registerUser(app);
      await http()
        .patch('/users/me')
        .set(...bearer(user))
        .send({
          email: `new-${Date.now()}@example.com`,
          currentPassword: 'not-the-password1',
        })
        .expect(400);
    });

    it('changes the address with the right password, warns the old one and asks the new one to confirm', async () => {
      const user = await registerUser(app);
      const newEmail = `new-${Date.now()}@example.com`;

      const res = await http()
        .patch('/users/me')
        .set(...bearer(user))
        .send({ email: newEmail, currentPassword: user.password })
        .expect(200);
      expect(res.body.email).toBe(newEmail);
      expect(res.body.emailVerifiedAt).toBeNull();

      const notice = await waitForMail(user.email, /changed/i);
      expect(notice.text).toContain(newEmail);
      await waitForMail(newEmail, /confirm/i);
    });

    it('does not reveal whether an address is taken to someone without the password', async () => {
      const victim = await registerUser(app);
      const attacker = await registerUser(app);

      await http()
        .patch('/users/me')
        .set(...bearer(attacker))
        .send({ email: victim.email, currentPassword: 'wrong-pass-1' })
        .expect(400);
      await http()
        .patch('/users/me')
        .set(...bearer(attacker))
        .send({ email: victim.email, currentPassword: attacker.password })
        .expect(409);
    });

    it('refuses to delete the account without (or with a wrong) password', async () => {
      const user = await registerUser(app);

      await http()
        .delete('/users/me')
        .set(...bearer(user))
        .expect(400);
      await http()
        .delete('/users/me')
        .set(...bearer(user))
        .send({ currentPassword: 'not-the-password1' })
        .expect(400);

      await http()
        .get('/users/me')
        .set(...bearer(user))
        .expect(200);
    });
  });

  describe('inviting members requires verified e-mail addresses', () => {
    it('lets a verified user invite a verified user', async () => {
      const owner = await registerUser(app);
      const invitee = await registerUser(app);
      const projectId = await createProject(app, owner);

      await http()
        .post(`/projects/${projectId}/members`)
        .set(...bearer(owner))
        .send({ email: invitee.email, role: 'MEMBER' })
        .expect(201);
    });

    it('refuses to invite while the inviting user is unverified', async () => {
      const owner = await registerUser(app, { verified: false });
      const invitee = await registerUser(app);
      const projectId = await createProject(app, owner);

      await http()
        .post(`/projects/${projectId}/members`)
        .set(...bearer(owner))
        .send({ email: invitee.email, role: 'MEMBER' })
        .expect(403);

      await verifyEmail(app, owner.email);
      await http()
        .post(`/projects/${projectId}/members`)
        .set(...bearer(owner))
        .send({ email: invitee.email, role: 'MEMBER' })
        .expect(201);
    });

    it('answers an unverified address exactly like an unknown one', async () => {
      const owner = await registerUser(app);
      const unverified = await registerUser(app, { verified: false });
      const projectId = await createProject(app, owner);

      const unknown = await http()
        .post(`/projects/${projectId}/members`)
        .set(...bearer(owner))
        .send({ email: `nobody-${Date.now()}@example.com`, role: 'MEMBER' })
        .expect(404);
      const unconfirmed = await http()
        .post(`/projects/${projectId}/members`)
        .set(...bearer(owner))
        .send({ email: unverified.email, role: 'MEMBER' })
        .expect(404);

      expect(unconfirmed.body.message).toBe(unknown.body.message);
    });

    it('an address changed by the user must be confirmed again before they can be invited', async () => {
      const owner = await registerUser(app);
      const invitee = await registerUser(app);
      const projectId = await createProject(app, owner);

      const newEmail = `moved-${Date.now()}@example.com`;
      await http()
        .patch('/users/me')
        .set(...bearer(invitee))
        .send({ email: newEmail, currentPassword: invitee.password })
        .expect(200);

      await http()
        .post(`/projects/${projectId}/members`)
        .set(...bearer(owner))
        .send({ email: newEmail, role: 'MEMBER' })
        .expect(404);

      await verifyEmail(app, newEmail);
      await http()
        .post(`/projects/${projectId}/members`)
        .set(...bearer(owner))
        .send({ email: newEmail, role: 'MEMBER' })
        .expect(201);
    });
  });
});
