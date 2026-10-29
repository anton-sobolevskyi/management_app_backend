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

  const host = databaseHost(env);

  if (!LOCAL_HOSTS.has(host) && env.ALLOW_REMOTE_SEED !== 'true') {
    throw new Error(
      `Refusing to seed "${host}": it is not a local database and seeding deletes all data. ` +
        'Set ALLOW_REMOTE_SEED=true if you really mean it.',
    );
  }
}

/** Password every demo account gets on a local database. */
export const DEFAULT_DEMO_PASSWORD = 'password123';

function databaseHost(env: NodeJS.ProcessEnv): string {
  try {
    return new URL(env.DATABASE_URL ?? '').hostname;
  } catch {
    // unparsable URL: treat like a unix-socket/local connection
    return '';
  }
}

/**
 * Guard for the NON-destructive demo seed (`npm run db:seed:demo`). It only creates
 * or refreshes the demo accounts and the demo projects, and leaves every other row
 * alone, so unlike the full seed it may be pointed at a live database. Writing to a
 * remote database still needs two explicit decisions:
 *  - ALLOW_REMOTE_SEED=true (same switch as the full seed)
 *  - SEED_DEMO_PASSWORD: a password of your own (the demo logins of a public site
 *    must not use the well-known default)
 *
 * Returns the password the demo accounts should get.
 */
export function assertSafeToSeedDemo(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const host = databaseHost(env);
  const configured = env.SEED_DEMO_PASSWORD;

  if (LOCAL_HOSTS.has(host)) {
    return configured?.trim()
      ? validateDemoPassword(configured)
      : DEFAULT_DEMO_PASSWORD;
  }

  if (env.ALLOW_REMOTE_SEED !== 'true') {
    throw new Error(
      `Refusing to seed "${host}": it is not a local database. ` +
        'Set ALLOW_REMOTE_SEED=true to confirm you want to add the demo data there ' +
        '(existing non-demo data is left untouched).',
    );
  }

  if (!configured?.trim()) {
    throw new Error(
      'Set SEED_DEMO_PASSWORD to a password of your own: the demo accounts of a ' +
        'remote database must not use the public default.',
    );
  }

  if (configured === DEFAULT_DEMO_PASSWORD) {
    throw new Error(
      'SEED_DEMO_PASSWORD must differ from the public default password.',
    );
  }

  return validateDemoPassword(configured);
}

/** Same rules as registration: 8-72 bytes with at least one letter and one number. */
function validateDemoPassword(password: string): string {
  const bytes = Buffer.byteLength(password, 'utf8');
  if (
    bytes < 8 ||
    bytes > 72 ||
    !/[A-Za-z]/.test(password) ||
    !/\d/.test(password)
  ) {
    throw new Error(
      'SEED_DEMO_PASSWORD must be 8-72 bytes and contain at least one letter and one number.',
    );
  }
  return password;
}
