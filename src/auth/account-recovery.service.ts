import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { OneTimeTokenType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AccountTokensService } from './account-tokens.service';
import { normalizeEmail } from '../common/utils/email';
import { getAllowedOrigins } from '../config/cors.config';
import { PasswordService } from './password.service';
import { revokeAllRefreshTokens } from './refresh-token.util';

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Password reset and e-mail verification flows. */
@Injectable()
export class AccountRecoveryService {
  private readonly logger = new Logger(AccountRecoveryService.name);

  constructor(
    private prisma: PrismaService,
    private tokens: AccountTokensService,
    private mail: MailService,
    private passwords: PasswordService,
  ) {}

  /** The frontend page that receives the token, e.g. https://app/reset-password?token=… */
  private link(path: string, token: string): string {
    const base = getAllowedOrigins()[0];
    return `${base}${path}?token=${encodeURIComponent(token)}`;
  }

  /**
   * Send a reset link if the address belongs to an account. Silent otherwise:
   * the caller must answer identically either way, or the endpoint would reveal
   * which addresses are registered.
   */
  async requestPasswordReset(rawEmail: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { email: normalizeEmail(rawEmail), deletedAt: null },
      select: { id: true, email: true },
    });
    if (!user) return;

    const token = await this.tokens.issue(
      user.id,
      user.email,
      OneTimeTokenType.PASSWORD_RESET,
      PASSWORD_RESET_TTL_MS,
    );

    await this.mail.send({
      to: user.email,
      subject: 'Reset your password',
      text:
        `Someone asked to reset the password of this account.\n\n` +
        `Set a new password (the link works once, for 1 hour):\n` +
        `${this.link('/reset-password', token)}\n\n` +
        `If this was not you, ignore this e-mail: your password stays the same.`,
    });
  }

  /**
   * Set a new password with a valid reset token and end every session: refresh
   * tokens are revoked and the token version is bumped, so stolen sessions die.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const { userId, email } = await this.tokens.consume(
      token,
      OneTimeTokenType.PASSWORD_RESET,
    );

    const passwordHash = await this.passwords.hash(newPassword);
    const now = new Date();

    // `email` ties the token to the address it was sent to; if the user changed
    // address since, or the account is gone, nothing matches.
    const [updated] = await this.prisma.$transaction([
      this.prisma.user.updateMany({
        where: { id: userId, email, deletedAt: null },
        data: {
          passwordHash,
          tokenVersion: { increment: 1 },
          // Opening the link proves access to the mailbox
          emailVerifiedAt: now,
        },
      }),
      revokeAllRefreshTokens(this.prisma, userId, now),
    ]);

    if (updated.count === 0) {
      throw new BadRequestException('Invalid or expired token');
    }
  }

  /** Mark the address as verified. Idempotent for an already verified address. */
  async verifyEmail(token: string): Promise<void> {
    const { userId, email } = await this.tokens.consume(
      token,
      OneTimeTokenType.EMAIL_VERIFICATION,
    );

    const { count } = await this.prisma.user.updateMany({
      where: { id: userId, email, deletedAt: null, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() },
    });

    if (count === 0) {
      // Either already verified (fine) or the address changed / account gone
      const user = await this.prisma.user.findFirst({
        where: { id: userId, email, deletedAt: null },
        select: { emailVerifiedAt: true },
      });
      if (!user) {
        throw new BadRequestException('Invalid or expired token');
      }
    }
  }

  /** Send a verification link to the account, unless it is already verified. */
  async sendVerificationEmail(userId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, email: true, emailVerifiedAt: true },
    });
    if (!user || user.emailVerifiedAt) return;

    const token = await this.tokens.issue(
      user.id,
      user.email,
      OneTimeTokenType.EMAIL_VERIFICATION,
      EMAIL_VERIFICATION_TTL_MS,
    );

    await this.mail.send({
      to: user.email,
      subject: 'Confirm your e-mail address',
      text:
        `Confirm this e-mail address (the link works once, for 24 hours):\n` +
        `${this.link('/verify-email', token)}\n\n` +
        `If you did not create an account, ignore this e-mail.`,
    });
  }

  /**
   * After an address change: warn the OLD mailbox (so a hijacked account does
   * not go unnoticed) and ask the NEW one to confirm. Best effort; never throws.
   */
  async notifyEmailChanged(
    userId: string,
    oldEmail: string,
    newEmail: string,
  ): Promise<void> {
    try {
      await this.mail.send({
        to: oldEmail,
        subject: 'Your e-mail address was changed',
        text:
          `The e-mail address of your account was changed to ${newEmail}.\n\n` +
          `If this was you, no action is needed.\n` +
          `If it was not, someone else has access to your account: change your password immediately.`,
      });
    } catch (err) {
      this.logger.warn(
        `Could not notify the old address: ${(err as Error).message}`,
      );
    }

    try {
      await this.sendVerificationEmail(userId);
    } catch (err) {
      this.logger.warn(
        `Could not send verification e-mail: ${(err as Error).message}`,
      );
    }
  }

  /** Same as above for a freshly registered address; never throws. */
  async sendVerificationEmailTo(rawEmail: string): Promise<void> {
    try {
      const user = await this.prisma.user.findFirst({
        where: { email: normalizeEmail(rawEmail), deletedAt: null },
        select: { id: true },
      });
      if (user) await this.sendVerificationEmail(user.id);
    } catch (err) {
      this.logger.warn(
        `Could not send verification e-mail: ${(err as Error).message}`,
      );
    }
  }
}
