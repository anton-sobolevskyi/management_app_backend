import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.service';

const HOUR_MS = 60 * 60 * 1000;
const REVOKED_RETENTION_MS = 7 * 24 * HOUR_MS;

/**
 * Housekeeping for the refresh_tokens table. It used to run inside every login
 * and refresh request; as a periodic job it costs those requests nothing.
 * Running it on several instances is harmless (idempotent DELETE).
 */
@Injectable()
export class TokenCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TokenCleanupService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private prisma: PrismaService,
    private config: AppConfigService,
  ) {}

  onModuleInit() {
    if (!this.config.backgroundJobsEnabled) return;

    // Delay the first run so it doesn't compete with startup traffic
    const first = setTimeout(() => void this.run(), 60_000);
    first.unref();
    this.timer = setInterval(() => void this.run(), HOUR_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Delete expired tokens, and revoked ones past their retention window. */
  async purge(now = new Date()): Promise<number> {
    const { count } = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: now } },
          {
            revoked: true,
            createdAt: { lt: new Date(now.getTime() - REVOKED_RETENTION_MS) },
          },
        ],
      },
    });
    const { count: oneTime } = await this.prisma.oneTimeToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: now } },
          { usedAt: { lt: new Date(now.getTime() - REVOKED_RETENTION_MS) } },
        ],
      },
    });
    return count + oneTime;
  }

  private async run() {
    try {
      const removed = await this.purge();
      if (removed > 0) {
        this.logger.log(`Purged ${removed} expired refresh tokens`);
      }
    } catch (err) {
      this.logger.warn(
        `Refresh token cleanup failed: ${(err as Error).message}`,
      );
    }
  }
}
