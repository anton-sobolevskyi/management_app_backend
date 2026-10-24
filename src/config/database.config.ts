import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { getAppConfig } from './app.config';

/**
 * @param poolMax pass the injected config's value; the default re-reads the
 *   environment and is meant for scripts outside the Nest container (seed).
 */
export const getDatabaseConfig = (
  poolMax: number = getAppConfig().db.poolMax,
): { adapter: PrismaPg; pool: Pool } => {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error('Missing DATABASE_URL');
  }

  const pool = new Pool({
    connectionString: url,
    max: poolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  const adapter = new PrismaPg(pool);

  return {
    adapter,
    pool,
  };
};
