import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { getAppConfig } from './app.config';

export const getDatabaseConfig = (): { adapter: PrismaPg; pool: Pool } => {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error('Missing DATABASE_URL');
  }

  const pool = new Pool({
    connectionString: url,
    max: getAppConfig().db.poolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  const adapter = new PrismaPg(pool);

  return {
    adapter,
    pool,
  };
};
