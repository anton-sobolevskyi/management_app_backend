import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { OneTimeTokenType } from '../generated/prisma/client';
import { AccountRecoveryService } from './account-recovery.service';

jest.mock('bcrypt');

describe('AccountRecoveryService', () => {
  const prisma: any = {
    user: { findFirst: jest.fn(), updateMany: jest.fn() },
    refreshToken: { updateMany: jest.fn() },
    $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops)),
  };
  const tokens = { issue: jest.fn(), consume: jest.fn() };
  const mail = { send: jest.fn() };
  const service = new AccountRecoveryService(
    prisma,
    tokens as any,
    mail as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FRONTEND_URL = 'https://app.example.com';
    (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');
    tokens.issue.mockResolvedValue('raw-token');
  });

  describe('requestPasswordReset', () => {
    it('mails a one-hour link to a registered address (normalised)', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u1', email: 'a@b.co' });

      await service.requestPasswordReset('  A@B.co ');

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { email: 'a@b.co', deletedAt: null },
        select: { id: true, email: true },
      });
      expect(tokens.issue).toHaveBeenCalledWith(
        'u1',
        'a@b.co',
        OneTimeTokenType.PASSWORD_RESET,
        60 * 60 * 1000,
      );
      expect(mail.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'a@b.co',
          text: expect.stringContaining(
            'https://app.example.com/reset-password?token=raw-token',
          ),
        }),
      );
    });

    it('does nothing (and does not throw) for an unknown address', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(
        service.requestPasswordReset('x@y.co'),
      ).resolves.toBeUndefined();
      expect(tokens.issue).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    beforeEach(() => {
      tokens.consume.mockResolvedValue({ userId: 'u1', email: 'a@b.co' });
      prisma.user.updateMany.mockResolvedValue({ count: 1 });
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });
    });

    it('sets the password, bumps the token version and revokes every session', async () => {
      await service.resetPassword('tok', 'Secret123');

      expect(tokens.consume).toHaveBeenCalledWith(
        'tok',
        OneTimeTokenType.PASSWORD_RESET,
      );
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'u1', email: 'a@b.co', deletedAt: null },
        data: {
          passwordHash: 'new-hash',
          tokenVersion: { increment: 1 },
          emailVerifiedAt: expect.any(Date),
        },
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', revoked: false },
        data: { revoked: true, revokedAt: expect.any(Date) },
      });
    });

    it('fails when the account no longer matches the token (deleted / new address)', async () => {
      prisma.user.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.resetPassword('tok', 'Secret123'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('propagates an invalid token without touching the account', async () => {
      tokens.consume.mockRejectedValue(new BadRequestException('bad'));
      await expect(service.resetPassword('tok', 'Secret123')).rejects.toThrow(
        'bad',
      );
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('verifyEmail', () => {
    beforeEach(() => {
      tokens.consume.mockResolvedValue({ userId: 'u1', email: 'a@b.co' });
    });

    it('marks the address verified', async () => {
      prisma.user.updateMany.mockResolvedValue({ count: 1 });
      await service.verifyEmail('tok');
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'u1',
          email: 'a@b.co',
          deletedAt: null,
          emailVerifiedAt: null,
        },
        data: { emailVerifiedAt: expect.any(Date) },
      });
    });

    it('is fine for an already verified address', async () => {
      prisma.user.updateMany.mockResolvedValue({ count: 0 });
      prisma.user.findFirst.mockResolvedValue({ emailVerifiedAt: new Date() });
      await expect(service.verifyEmail('tok')).resolves.toBeUndefined();
    });

    it('rejects a link for an address the user has since changed', async () => {
      prisma.user.updateMany.mockResolvedValue({ count: 0 });
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.verifyEmail('tok')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('sendVerificationEmail', () => {
    it('skips an already verified account', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'u1',
        email: 'a@b.co',
        emailVerifiedAt: new Date(),
      });
      await service.sendVerificationEmail('u1');
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('sends a 24-hour link to an unverified one', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'u1',
        email: 'a@b.co',
        emailVerifiedAt: null,
      });
      await service.sendVerificationEmail('u1');
      expect(tokens.issue).toHaveBeenCalledWith(
        'u1',
        'a@b.co',
        OneTimeTokenType.EMAIL_VERIFICATION,
        24 * 60 * 60 * 1000,
      );
      expect(mail.send).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('/verify-email?token=raw-token'),
        }),
      );
    });

    it('sendVerificationEmailTo never throws (a mail outage must not break sign-up)', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'u1',
        email: 'a@b.co',
        emailVerifiedAt: null,
      });
      mail.send.mockRejectedValue(new Error('smtp down'));
      await expect(
        service.sendVerificationEmailTo('a@b.co'),
      ).resolves.toBeUndefined();
    });
  });
});
