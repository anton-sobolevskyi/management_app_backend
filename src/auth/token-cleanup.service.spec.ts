import { TokenCleanupService } from './token-cleanup.service';

describe('TokenCleanupService', () => {
  const prisma: any = { refreshToken: { deleteMany: jest.fn() } };
  const service = new TokenCleanupService(prisma);
  const DAY = 86_400_000;

  beforeEach(() => jest.clearAllMocks());

  it('deletes expired tokens and revoked tokens older than a week', async () => {
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 3 });
    const now = new Date('2026-10-21T12:00:00Z');

    await expect(service.purge(now)).resolves.toBe(3);

    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { expiresAt: { lt: now } },
          {
            revoked: true,
            createdAt: { lt: new Date(now.getTime() - 7 * DAY) },
          },
        ],
      },
    });
  });

  it('does not start timers when background jobs are disabled (test env)', () => {
    const spy = jest.spyOn(global, 'setInterval');
    service.onModuleInit();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('starts an unref-ed timer when enabled and stops it on destroy', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    jest.useFakeTimers();
    try {
      const s = new TokenCleanupService(prisma);
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
      s.onModuleInit();
      jest.advanceTimersByTime(60_001);
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledTimes(1);
      s.onModuleDestroy();
      jest.advanceTimersByTime(2 * 3_600_000);
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
      process.env.NODE_ENV = original;
    }
  });

  it('swallows failures so a DB blip cannot crash the process', async () => {
    prisma.refreshToken.deleteMany.mockRejectedValue(new Error('db down'));
    await expect(service['run']()).resolves.toBeUndefined();
  });
});
