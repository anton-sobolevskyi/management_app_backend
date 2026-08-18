import { Injectable } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client';
import { getDatabaseConfig } from '../config/database.config';

@Injectable()
export class PrismaService extends PrismaClient {
  constructor() {
    const { adapter } = getDatabaseConfig();
    
    // If DATABASE_URL is set (e.g., by Testcontainers), use it directly
    const options = process.env.DATABASE_URL 
      ? { datasources: { db: { url: process.env.DATABASE_URL } } }
      : { adapter };

    super(options);
  }
}
