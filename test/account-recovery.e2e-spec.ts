import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MailService } from '../src/mail/mail.service';
import { createTestApp, registerUser } from './helpers';

const cookieOf = (res: request.Response) =>
  ((res.headers['set-cookie'] as unknown as string[] | undefined) ?? []).find(
    (c) => c.startsWith('refreshToken='),
  );

describe('Account recovery (e2e)', () => {
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

  /** E-mails are sent in the background: wait for the one addressed to `to`. */
  async function tokenMailedTo(to: string, subject: RegExp): Promise<string> {
    for (let i = 0; i < 50; i++) {
      const msg = [...mail.outbox]
        .reverse()
        .find((m) => m.to === to && subject.test(m.subject));
      if (msg) return /token=([^\s&]+)/.exec(msg.text)![1];
      await new Promise((r) => setTimeout(r, 40));
    }
    throw new Error(`No e-mail to ${to} matching ${subject}`);
  }

  const mailsTo = (to: string) => mail.outbox.filter((m) => m.to === to).length;
  const me = (token: string) =>
    http().get('/users/me').set('Authorization', `Bearer ${token}`);

  describe('e-mail verification', () => {
    it('sends a link on sign-up; using it verifies the address once', async () => {
      const user = await registerUser(app);
      expect((await me(user.accessToken)).body.emailVerifiedAt).toBeNull();

      const token = await tokenMailedTo(user.email, /Confirm/);
      await http().post('/auth/verify-email').send({ token }).expect(204);

      expect((await me(user.accessToken)).body.emailVerifiedAt).not.toBeNull();
      // single use
      await http().post('/auth/verify-email').send({ token }).expect(400);
    });

    it('rejects garbage and a token of the wrong kind', async () => {
      await http()
        .post('/auth/verify-email')
        .send({ token: 'x'.repeat(43) })
        .expect(400);
      await http()
        .post('/auth/verify-email')
        .send({ token: 'short' })
        .expect(400);
      await http().post('/auth/verify-email').send({}).expect(400);

      // a password-reset token must not verify an address
      const user = await registerUser(app);
      await http().post('/auth/forgot-password').send({ email: user.email });
      const resetToken = await tokenMailedTo(user.email, /Reset/);
      await http()
        .post('/auth/verify-email')
        .send({ token: resetToken })
        .expect(400);
    });

    it('resend-verification needs a login, and skips verified accounts', async () => {
      await http().post('/auth/resend-verification').expect(401);

      const user = await registerUser(app);
      await tokenMailedTo(user.email, /Confirm/);
      const before = mailsTo(user.email);

      await http()
        .post('/auth/resend-verification')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(204);
      expect(mailsTo(user.email)).toBe(before + 1);

      // the newest link replaces the older one
      const fresh = await tokenMailedTo(user.email, /Confirm/);
      await http()
        .post('/auth/verify-email')
        .send({ token: fresh })
        .expect(204);

      await http()
        .post('/auth/resend-verification')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(204);
      expect(mailsTo(user.email)).toBe(before + 1);
    });

    it('changing the address makes the account unverified again', async () => {
      const user = await registerUser(app);
      const token = await tokenMailedTo(user.email, /Confirm/);
      await http().post('/auth/verify-email').send({ token }).expect(204);

      const newEmail = `new-${Date.now()}@example.com`;
      const updated = await http()
        .patch('/users/me')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ email: newEmail })
        .expect(200);

      expect(updated.body.emailVerifiedAt).toBeNull();
    });
  });

  describe('password reset', () => {
    it('answers 204 for unknown addresses and sends nothing', async () => {
      const before = mail.outbox.length;
      await http()
        .post('/auth/forgot-password')
        .send({ email: `nobody-${Date.now()}@example.com` })
        .expect(204);
      await new Promise((r) => setTimeout(r, 200));
      expect(mail.outbox.length).toBe(before);
    });

    it('rejects an invalid address', async () => {
      await http()
        .post('/auth/forgot-password')
        .send({ email: 'nope' })
        .expect(400);
    });

    it('resets the password, ends every session, and the link works once', async () => {
      const user = await registerUser(app);
      const login = await http()
        .post('/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(200);
      const oldRefresh = cookieOf(login)!.split(';')[0];

      await http()
        .post('/auth/forgot-password')
        .send({ email: user.email })
        .expect(204);
      const token = await tokenMailedTo(user.email, /Reset/);

      // a weak password is refused and does not burn the token
      await http()
        .post('/auth/reset-password')
        .send({ token, newPassword: 'short' })
        .expect(400);

      await http()
        .post('/auth/reset-password')
        .send({ token, newPassword: 'BrandNew123' })
        .expect(204);

      // old access token and old refresh token are dead
      await me(user.accessToken).expect(401);
      await http().post('/auth/refresh').set('Cookie', oldRefresh).expect(401);

      // old password no longer works, the new one does
      await http()
        .post('/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(401);
      const again = await http()
        .post('/auth/login')
        .send({ email: user.email, password: 'BrandNew123' })
        .expect(200);
      const profile = await me(again.body.accessToken).expect(200);
      // opening the mailed link also proves the mailbox
      expect(profile.body.emailVerifiedAt).not.toBeNull();

      // single use
      await http()
        .post('/auth/reset-password')
        .send({ token, newPassword: 'Another123' })
        .expect(400);
    });

    it('a newer reset link invalidates the previous one', async () => {
      const user = await registerUser(app);
      await http().post('/auth/forgot-password').send({ email: user.email });
      const first = await tokenMailedTo(user.email, /Reset/);

      const before = mailsTo(user.email);
      await http().post('/auth/forgot-password').send({ email: user.email });
      for (let i = 0; i < 50 && mailsTo(user.email) === before; i++) {
        await new Promise((r) => setTimeout(r, 40));
      }
      const second = await tokenMailedTo(user.email, /Reset/);
      expect(second).not.toBe(first);

      await http()
        .post('/auth/reset-password')
        .send({ token: first, newPassword: 'Another123' })
        .expect(400);
      await http()
        .post('/auth/reset-password')
        .send({ token: second, newPassword: 'Another123' })
        .expect(204);
    });

    it('two simultaneous uses of one link: exactly one wins', async () => {
      const user = await registerUser(app);
      await http().post('/auth/forgot-password').send({ email: user.email });
      const token = await tokenMailedTo(user.email, /Reset/);

      const [a, b] = await Promise.all([
        http()
          .post('/auth/reset-password')
          .send({ token, newPassword: 'Winner123' }),
        http()
          .post('/auth/reset-password')
          .send({ token, newPassword: 'Loser1234' }),
      ]);
      expect([a.status, b.status].sort()).toEqual([204, 400]);
    });
  });
});
