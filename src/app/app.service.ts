import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private prisma: PrismaService) {}

  /** Liveness: the process is up. Cheap, no dependencies. */
  healthCheck(): { status: string } {
    return {
      status: 'Ok',
    };
  }

  /** Readiness: the database answers. Use this for load-balancer checks. */
  async readiness(): Promise<{ status: string; database: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }

    return { status: 'ok', database: 'up' };
  }
}
