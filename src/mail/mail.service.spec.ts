import { MailService } from './mail.service';
import { AppConfigService } from '../config/app-config.service';

describe('MailService', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  const msg = { to: 'a@b.co', subject: 'Hi', text: 'link' };

  it('keeps messages in the outbox with the memory transport (capped)', async () => {
    process.env.MAIL_TRANSPORT = 'memory';
    const mail = new MailService(new AppConfigService());
    for (let i = 0; i < 105; i++) await mail.send({ ...msg, subject: `m${i}` });
    expect(mail.outbox).toHaveLength(100);
    expect(mail.outbox[99].subject).toBe('m104');
  });

  it('console transport sends nothing and never throws', async () => {
    process.env.MAIL_TRANSPORT = 'console';
    process.env.NODE_ENV = 'development';
    const mail = new MailService(new AppConfigService());
    await expect(mail.send(msg)).resolves.toBeUndefined();
    expect(mail.outbox).toHaveLength(0);
  });

  it('does not print the message body in production', async () => {
    process.env.MAIL_TRANSPORT = 'console';
    process.env.NODE_ENV = 'production';
    const mail = new MailService(new AppConfigService());
    const log = jest.spyOn((mail as any).logger, 'log');
    const warn = jest.spyOn((mail as any).logger, 'warn').mockImplementation();
    await mail.send({ ...msg, text: 'https://x/reset?token=SECRET' });
    expect(log).not.toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain('SECRET');
  });

  it('uses SMTP when SMTP_URL is set', () => {
    delete process.env.MAIL_TRANSPORT;
    process.env.SMTP_URL = 'smtp://user:pass@localhost:2525';
    const mail = new MailService(new AppConfigService());
    expect((mail as any).transporter).toBeDefined();
  });
});
