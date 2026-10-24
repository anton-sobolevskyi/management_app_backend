import type { PrismaClient } from '../generated/prisma/client';

/** Anything that exposes the RefreshToken delegate: PrismaService or a `tx`. */
type RefreshTokenDb = Pick<PrismaClient, 'refreshToken'>;

/**
 * End every session of a user. Returns the (lazy) Prisma operation, so it can
 * be awaited directly, run on a transaction client, or be listed in a
 * `$transaction([...])` array alongside other operations.
 */
export function revokeAllRefreshTokens(
  db: RefreshTokenDb,
  userId: string,
  at: Date = new Date(),
) {
  return db.refreshToken.updateMany({
    where: { userId, revoked: false },
    data: { revoked: true, revokedAt: at },
  });
}
