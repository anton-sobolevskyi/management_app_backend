import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { AppConfigService } from '../config/app-config.service';

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
/** Waits before the 2nd and 3rd attempt: at most ~2.5 s extra in total. */
const RETRY_DELAYS_MS = [500, 2000];

const TRANSIENT_CODES = new Set([
  'ECONNECTION',
  'ECONNREFUSED',
  'ECONNRESET',
  'EDNS',
  'EAI_AGAIN',
  'ESOCKET',
  'ETIMEDOUT',
]);

function isTransient(err: unknown): boolean {
  const { code, responseCode } = err as {
    code?: string;
    responseCode?: number;
  };
  if (code && TRANSIENT_CODES.has(code)) return true;
  return (
    typeof responseCode === 'number' &&
    responseCode >= 400 &&
    responseCode < 500
  );
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter?: Transporter;
  /** Only filled by the `memory` transport. */
  readonly outbox: MailMessage[] = [];

  constructor(private config: AppConfigService) {
    const { transport, smtpUrl } = config.mail;
    if (transport === 'smtp' && smtpUrl) {
      this.transporter = createTransport(smtpUrl);
    }
  }

  async send(message: MailMessage): Promise<void> {
    const { transport, from } = this.config.mail;

    if (transport === 'memory') {
      this.outbox.push(message);
      if (this.outbox.length > OUTBOX_LIMIT) this.outbox.shift();
      return;
    }

    if (transport === 'smtp' && this.transporter) {
      await this.sendWithRetry(this.transporter, { from, ...message });
      return;
    }

    // console transport. The body holds one-time links, so it is only printed
    // outside production, where it is the way to read them without an inbox.
    if (this.config.isProduction) {
      this.logger.warn(
        `E-mail not delivered (no SMTP_URL configured): "${message.subject}"`,
      );
    } else {
      this.logger.log(
        `E-mail to ${message.to}: ${message.subject}\n${message.text}`,
      );
    }
  }

  /**
   * A mail server that is briefly unreachable should not cost the user their
   * verification or reset link. Transient failures (connection problems and
   * 4xx replies) are retried a couple of times with a short, bounded delay;
   * anything else (bad recipient, rejected message) fails at once.
   *
   * Deliberately in memory, not a database outbox: the body holds one-time
   * links, which the database only ever stores as hashes.
   */
  private async sendWithRetry(
    transporter: Transporter,
    mail: Parameters<Transporter['sendMail']>[0],
  ): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      try {
        await transporter.sendMail(mail);
        return;
      } catch (err) {
        const delay = RETRY_DELAYS_MS[attempt];
        if (delay === undefined || !isTransient(err)) throw err;
        this.logger.warn(
          `Mail delivery failed (${(err as Error).message}); retrying in ${delay} ms`,
        );
        await this.delay(delay);
      }
    }
  }

  /** Replaceable in tests so they don't wait. */
  delay: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms));
}
