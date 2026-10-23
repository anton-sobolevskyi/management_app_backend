import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { getAppConfig } from '../config/app.config';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

const OUTBOX_LIMIT = 100;

/**
 * Sends transactional e-mail. Which transport is used comes from config:
 * - smtp:    real delivery through SMTP_URL (e.g. smtps://user:pass@host:465)
 * - console: nothing is sent; the message is logged (local development)
 * - memory:  messages are kept in `outbox` (tests)
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter?: Transporter;
  /** Only filled by the `memory` transport. */
  readonly outbox: MailMessage[] = [];

  constructor() {
    const { transport, smtpUrl } = getAppConfig().mail;
    if (transport === 'smtp' && smtpUrl) {
      this.transporter = createTransport(smtpUrl);
    }
  }

  async send(message: MailMessage): Promise<void> {
    const { transport, from } = getAppConfig().mail;

    if (transport === 'memory') {
      this.outbox.push(message);
      if (this.outbox.length > OUTBOX_LIMIT) this.outbox.shift();
      return;
    }

    if (transport === 'smtp' && this.transporter) {
      await this.transporter.sendMail({ from, ...message });
      return;
    }

    // console transport. The body holds one-time links, so it is only printed
    // outside production, where it is the way to read them without an inbox.
    if (process.env.NODE_ENV === 'production') {
      this.logger.warn(
        `E-mail not delivered (no SMTP_URL configured): "${message.subject}"`,
      );
    } else {
      this.logger.log(
        `E-mail to ${message.to}: ${message.subject}\n${message.text}`,
      );
    }
  }
}
