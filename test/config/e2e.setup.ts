import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { config } from 'dotenv';

config({ path: resolve(__dirname, '../.env.test'), override: true });

const DB_URL_FILE = resolve(__dirname, '../.e2e-state/database-url');

if (existsSync(DB_URL_FILE)) {
  process.env.DATABASE_URL = readFileSync(DB_URL_FILE, 'utf8').trim();
}

jest.setTimeout(60000);
