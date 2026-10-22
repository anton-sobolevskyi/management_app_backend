const LOCAL_HOSTS = new Set([
  '',
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  'db',
  'postgres',
]);

/**
 * The seed script deletes EVERY row of EVERY table first. Refuse to run it
 * against anything that doesn't look like a local development database:
 *  - NODE_ENV=production is never allowed
 *  - a DATABASE_URL pointing at a non-local host needs ALLOW_REMOTE_SEED=true
 *    (the usual accident is a developer laptop with a prod URL in its .env,
 *    where NODE_ENV is not set to production)
 */
export function assertSafeToSeed(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing to seed: NODE_ENV=production. Seeding deletes all data.',
    );
  }

  let host = '';
  try {
    host = new URL(env.DATABASE_URL ?? '').hostname;
  } catch {
    // unparsable URL: treat like a unix-socket/local connection
  }

  if (!LOCAL_HOSTS.has(host) && env.ALLOW_REMOTE_SEED !== 'true') {
    throw new Error(
      `Refusing to seed "${host}": it is not a local database and seeding deletes all data. ` +
        'Set ALLOW_REMOTE_SEED=true if you really mean it.',
    );
  }
}
