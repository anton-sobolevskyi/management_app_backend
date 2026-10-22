import { assertSafeToSeed } from './seed-guard';

const env = (e: Record<string, string>) => e as NodeJS.ProcessEnv;
const db = (host: string) => `postgresql://u:p@${host}:5432/app`;

describe('assertSafeToSeed', () => {
  it.each(['localhost', '127.0.0.1', 'db', 'postgres'])('allows %s', (host) => {
    expect(() =>
      assertSafeToSeed(env({ DATABASE_URL: db(host) })),
    ).not.toThrow();
  });

  it('allows unix-socket style URLs', () => {
    expect(() =>
      assertSafeToSeed(
        env({ DATABASE_URL: 'postgresql://u@/app?host=/var/run/postgresql' }),
      ),
    ).not.toThrow();
  });

  it('never runs with NODE_ENV=production, even against localhost or with the override', () => {
    const base = { NODE_ENV: 'production', DATABASE_URL: db('localhost') };
    expect(() => assertSafeToSeed(env(base))).toThrow(/NODE_ENV=production/);
    expect(() =>
      assertSafeToSeed(env({ ...base, ALLOW_REMOTE_SEED: 'true' })),
    ).toThrow(/NODE_ENV=production/);
  });

  it('refuses a remote database (a prod URL in a laptop .env) unless explicitly allowed', () => {
    const remote = {
      DATABASE_URL: db('dpg-abc123.frankfurt-postgres.render.com'),
    };
    expect(() => assertSafeToSeed(env(remote))).toThrow(/not a local database/);
    expect(() =>
      assertSafeToSeed(env({ ...remote, ALLOW_REMOTE_SEED: 'true' })),
    ).not.toThrow();
  });
});
