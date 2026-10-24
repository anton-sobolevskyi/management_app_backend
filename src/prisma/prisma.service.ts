import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Pool } from 'pg';
import { PrismaClient } from '../generated/prisma/client';
import { getDatabaseConfig } from '../config/database.config';
import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: Pool;

  constructor(config: AppConfigService) {
    const { adapter, pool } = getDatabaseConfig(config.db.poolMax);

    super({ adapter });
    this.pool = pool;
  }

  /** Runs on app.close() and on SIGTERM/SIGINT (enableShutdownHooks). */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();

    try {
      if (!this.pool.ended) {
        await this.pool.end();
      }
    } catch (err) {
      this.logger.warn(
        `Error closing database pool: ${(err as Error).message}`,
      );
    }
  }
}
