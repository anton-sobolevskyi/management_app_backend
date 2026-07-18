import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

export const getDatabaseConfig = (): { adapter: PrismaPg; pool: Pool } => {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error('Missing DATABASE_URL');
  }

  const pool = new Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);

  return {
    adapter,
    pool,
  };
};
