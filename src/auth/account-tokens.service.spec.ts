import { BadRequestException } from '@nestjs/common';
import { OneTimeTokenType } from '../generated/prisma/client';
import { hashToken } from '../common/utils/token-hash';
import { AccountTokensService } from './account-tokens.service';

describe('AccountTokensService', () => {
  const prisma: any = {
    oneTimeToken: {
      deleteMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops)),
  };
  const service = new AccountTokensService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('issues a random token and stores only its hash, replacing unused ones', async () => {
    const token = await service.issue(
      'u1',
      'a@b.co',
      OneTimeTokenType.PASSWORD_RESET,
      60_000,
    );

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(prisma.oneTimeToken.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'u1',
        type: OneTimeTokenType.PASSWORD_RESET,
        usedAt: null,
      },
    });
    const { data } = prisma.oneTimeToken.create.mock.calls[0][0];
    expect(data.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(data)).not.toContain(token);
    expect(data.email).toBe('a@b.co');
    expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('two tokens for the same user are different', async () => {
    const a = await service.issue(
      'u1',
      'a@b.co',
      OneTimeTokenType.PASSWORD_RESET,
      1000,
    );
    const b = await service.issue(
      'u1',
      'a@b.co',
      OneTimeTokenType.PASSWORD_RESET,
      1000,
    );
    expect(a).not.toEqual(b);
  });

  it('consumes a valid token atomically and returns its owner', async () => {
    prisma.oneTimeToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.oneTimeToken.findUnique.mockResolvedValue({
      userId: 'u1',
      email: 'a@b.co',
    });

    await expect(
      service.consume('tok', OneTimeTokenType.PASSWORD_RESET),
    ).resolves.toEqual({ userId: 'u1', email: 'a@b.co' });

    expect(prisma.oneTimeToken.updateMany).toHaveBeenCalledWith({
      where: {
        tokenHash: hashToken('tok'),
        type: OneTimeTokenType.PASSWORD_RESET,
        usedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      data: { usedAt: expect.any(Date) },
    });
  });

  it('rejects unknown, used, expired or wrong-type tokens the same way', async () => {
    prisma.oneTimeToken.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.consume('nope', OneTimeTokenType.EMAIL_VERIFICATION),
    ).rejects.toThrow(new BadRequestException('Invalid or expired token'));
    expect(prisma.oneTimeToken.findUnique).not.toHaveBeenCalled();
  });
});
