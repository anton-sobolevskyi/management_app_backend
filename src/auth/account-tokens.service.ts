import { BadRequestException, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { OneTimeTokenType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { hashToken } from '../common/utils/token-hash';

/**
 * Single-use tokens behind e-mailed links (password reset, e-mail verification).
 * Only the SHA-256 of the token is stored; whoever reads the database cannot
 * use the links. A token works once and only before it expires.
 */
@Injectable()
export class AccountTokensService {
  constructor(private prisma: PrismaService) {}

  /** Create a token for the user, replacing any unused one of the same type. */
  async issue(
    userId: string,
    email: string,
    type: OneTimeTokenType,
    ttlMs: number,
  ): Promise<string> {
    const token = randomBytes(32).toString('base64url');

    await this.prisma.$transaction([
      this.prisma.oneTimeToken.deleteMany({
        where: { userId, type, usedAt: null },
      }),
      this.prisma.oneTimeToken.create({
        data: {
          userId,
          email,
          type,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + ttlMs),
        },
      }),
    ]);

    return token;
  }

  /**
   * Mark the token used and return who it was issued for. The conditional
   * UPDATE is atomic, so of two concurrent requests with the same token exactly
   * one succeeds. Unknown, used and expired tokens are indistinguishable.
   */
  async consume(
    token: string,
    type: OneTimeTokenType,
  ): Promise<{ userId: string; email: string }> {
    const tokenHash = hashToken(token);
    const now = new Date();

    const { count } = await this.prisma.oneTimeToken.updateMany({
      where: { tokenHash, type, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });

    const row =
      count === 1
        ? await this.prisma.oneTimeToken.findUnique({
            where: { tokenHash },
            select: { userId: true, email: true },
          })
        : null;

    if (!row) {
      throw new BadRequestException('Invalid or expired token');
    }

    return row;
  }
}
