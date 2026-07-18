import { Injectable } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client';
import { getDatabaseConfig } from '../config/database.config';

@Injectable()
export class PrismaService extends PrismaClient {
  constructor() {
    const { adapter } = getDatabaseConfig();

    super({ adapter });
  }
}
