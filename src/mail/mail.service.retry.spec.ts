import { MailService } from './mail.service';
import { AppConfigService } from '../config/app-config.service';

describe('MailService SMTP retry', () => {
  const message = { to: 'a@b.co', subject: 'Hi', text: 'Body' };

  function build(sendMail: jest.Mock) {
    const service = new MailService(
      new AppConfigService({
        MAIL_TRANSPORT: 'smtp',
        SMTP_URL: 'smtp://localhost:2525',
      }),
    );
    (service as any).transporter = { sendMail };
    service.delay = jest.fn().mockResolvedValue(undefined);
    return service;
  }

  it('delivers on the first attempt without waiting', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    const service = build(sendMail);

    await service.send(message);

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(service.delay).not.toHaveBeenCalled();
  });

  it.each([
    ['a connection error', { code: 'ECONNECTION' }],
    ['a timeout', { code: 'ETIMEDOUT' }],
    ['a 4xx reply (greylisting, mailbox busy)', { responseCode: 451 }],
  ])('retries after %s and then succeeds', async (_name, failure) => {
    const sendMail = jest
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('boom'), failure))
      .mockResolvedValue({});
    const service = build(sendMail);

    await service.send(message);

    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(service.delay).toHaveBeenCalledWith(500);
  });

  it('gives up after three attempts and reports the error', async () => {
    const sendMail = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('down'), { code: 'ESOCKET' }));
    const service = build(sendMail);

    await expect(service.send(message)).rejects.toThrow('down');

    expect(sendMail).toHaveBeenCalledTimes(3);
    expect((service.delay as jest.Mock).mock.calls).toEqual([[500], [2000]]);
  });

  it.each([
    ['a 5xx rejection (bad recipient)', { responseCode: 550 }],
    ['an error without a code', {}],
  ])('does not retry %s', async (_name, failure) => {
    const sendMail = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('no'), failure));
    const service = build(sendMail);

    await expect(service.send(message)).rejects.toThrow('no');

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(service.delay).not.toHaveBeenCalled();
  });
});
