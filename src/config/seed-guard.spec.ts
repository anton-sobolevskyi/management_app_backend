import {
  assertSafeToSeed,
  assertSafeToSeedDemo,
  DEFAULT_DEMO_PASSWORD,
} from './seed-guard';

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

describe('assertSafeToSeedDemo', () => {
  const remote = {
    DATABASE_URL: db('dpg-abc123.frankfurt-postgres.render.com'),
  };

  it('uses the public default password on a local database', () => {
    expect(assertSafeToSeedDemo(env({ DATABASE_URL: db('localhost') }))).toBe(
      DEFAULT_DEMO_PASSWORD,
    );
  });

  it('lets a local database use a custom password', () => {
    expect(
      assertSafeToSeedDemo(
        env({
          DATABASE_URL: db('localhost'),
          SEED_DEMO_PASSWORD: 'my-pass-123',
        }),
      ),
    ).toBe('my-pass-123');
  });

  it('is allowed with NODE_ENV=production because it never deletes other data', () => {
    expect(() =>
      assertSafeToSeedDemo(
        env({ NODE_ENV: 'production', DATABASE_URL: db('localhost') }),
      ),
    ).not.toThrow();
  });

  it('refuses a remote database without ALLOW_REMOTE_SEED', () => {
    expect(() =>
      assertSafeToSeedDemo(
        env({ ...remote, SEED_DEMO_PASSWORD: 'my-pass-123' }),
      ),
    ).toThrow(/not a local database/);
  });

  it('refuses a remote database without a password of its own', () => {
    expect(() =>
      assertSafeToSeedDemo(env({ ...remote, ALLOW_REMOTE_SEED: 'true' })),
    ).toThrow(/SEED_DEMO_PASSWORD/);
    expect(() =>
      assertSafeToSeedDemo(
        env({
          ...remote,
          ALLOW_REMOTE_SEED: 'true',
          SEED_DEMO_PASSWORD: DEFAULT_DEMO_PASSWORD,
        }),
      ),
    ).toThrow(/public default/);
  });

  it('accepts a remote database when both decisions are explicit', () => {
    expect(
      assertSafeToSeedDemo(
        env({
          ...remote,
          ALLOW_REMOTE_SEED: 'true',
          SEED_DEMO_PASSWORD: 'Sup3r-secret-demo',
        }),
      ),
    ).toBe('Sup3r-secret-demo');
  });

  it.each(['short1', 'onlyletters', '12345678', 'x'.repeat(73) + '1'])(
    'rejects the weak or too long password %p',
    (password) => {
      expect(() =>
        assertSafeToSeedDemo(
          env({ DATABASE_URL: db('localhost'), SEED_DEMO_PASSWORD: password }),
        ),
      ).toThrow(/8-72 bytes/);
    },
  );
});
