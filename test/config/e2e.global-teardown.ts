import { readFileSync, existsSync, rmSync } from 'fs';
import { resolve } from 'path';

const STATE_DIR = resolve(__dirname, '../.e2e-state');

export default async function globalTeardown() {
  const container = (globalThis as any).__E2E_PG_CONTAINER__;
  if (container && typeof container.stop === 'function') {
    await container.stop();
  }

  if (existsSync(STATE_DIR)) {
    rmSync(STATE_DIR, { recursive: true, force: true });
  }
}
