import { getRefreshCookieOptions, parseSameSite } from './cookie.config';
import { getAllowedOrigins } from './cors.config';
import { getTrustProxy } from './trust-proxy.config';
import { validateEnv } from './env.validation';
import { getAppConfig, parseDurationMs } from './app.config';

const env = (e: Record<string, string>) => e as NodeJS.ProcessEnv;

describe('cookie.config', () => {
  it('defaults to lax, non-secure outside production', () => {
    expect(getRefreshCookieOptions(env({ NODE_ENV: 'development' }))).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/auth',
    });
  });

  it('is secure in production', () => {
    expect(
      getRefreshCookieOptions(env({ NODE_ENV: 'production' })).secure,
    ).toBe(true);
  });

  it('forces Secure when SameSite=None, even outside production', () => {
    const opts = getRefreshCookieOptions(
      env({ NODE_ENV: 'development', COOKIE_SAME_SITE: 'None' }),
    );
    expect(opts).toMatchObject({ sameSite: 'none', secure: true });
  });

  it('falls back to lax for unknown values', () => {
    expect(parseSameSite('bogus')).toBe('lax');
    expect(parseSameSite(undefined)).toBe('lax');
  });
});

describe('cors.config', () => {
  it('splits, trims and strips trailing slashes', () => {
    expect(
      getAllowedOrigins(
        env({ FRONTEND_URL: ' https://a.com/ , https://b.com' }),
      ),
    ).toEqual(['https://a.com', 'https://b.com']);
  });
  it('defaults to the Vite dev server', () => {
    expect(getAllowedOrigins(env({}))).toEqual(['http://localhost:5173']);
  });
});

describe('trust-proxy.config', () => {
  it.each([
    [{}, false],
    [{ NODE_ENV: 'production' }, 1],
    [{ TRUST_PROXY: '2' }, 2],
    [{ TRUST_PROXY: 'true' }, true],
    [{ TRUST_PROXY: 'false', NODE_ENV: 'production' }, false],
    [{ TRUST_PROXY: 'loopback' }, 'loopback'],
  ])('%j -> %j', (e, expected) => {
    expect(getTrustProxy(env(e))).toBe(expected);
  });
});

describe('validateEnv', () => {
  const base = {
    DATABASE_URL: 'x',
    JWT_ACCESS_SECRET: 'a',
    JWT_REFRESH_SECRET: 'b',
  };
  it('rejects an invalid COOKIE_SAME_SITE', () => {
    expect(() =>
      validateEnv(env({ ...base, COOKIE_SAME_SITE: 'maybe' })),
    ).toThrow(/COOKIE_SAME_SITE/);
  });
  it('accepts valid values', () => {
    expect(() =>
      validateEnv(env({ ...base, COOKIE_SAME_SITE: 'none' })),
    ).not.toThrow();
  });
});

describe('app.config', () => {
  it.each([
    ['30s', 30_000],
    ['15m', 900_000],
    ['12h', 43_200_000],
    ['7d', 604_800_000],
  ])('parses %s', (input, ms) => {
    expect(parseDurationMs(input)).toBe(ms);
  });

  it.each(['', '7', 'd7', '1w', '-5m', '1.5h'])('rejects %j', (bad) => {
    expect(() => parseDurationMs(bad)).toThrow(/Invalid duration/);
  });

  it('applies defaults', () => {
    const c = getAppConfig(env({}));
    expect(c.jwt.accessExpiresIn).toBe('15m');
    expect(c.jwt.accessExpiresInSeconds).toBe(900);
    expect(c.jwt.refreshTtlMs).toBe(604_800_000);
    expect(c.bcryptRounds).toBe(12);
    expect(c.db.poolMax).toBe(10);
    expect(c.swaggerEnabled).toBe(true);
  });

  it('honours JWT_EXPIRES_IN / REFRESH_TOKEN_EXPIRES_IN (previously ignored)', () => {
    const c = getAppConfig(
      env({ JWT_EXPIRES_IN: '5m', REFRESH_TOKEN_EXPIRES_IN: '30d' }),
    );
    expect(c.jwt.accessExpiresInSeconds).toBe(300);
    expect(c.jwt.refreshTtlMs).toBe(30 * 86_400_000);
  });

  it('clamps bcrypt cost to a sane range and falls back on junk', () => {
    expect(getAppConfig(env({ BCRYPT_ROUNDS: '4' })).bcryptRounds).toBe(10);
    expect(getAppConfig(env({ BCRYPT_ROUNDS: '99' })).bcryptRounds).toBe(15);
    expect(getAppConfig(env({ BCRYPT_ROUNDS: 'abc' })).bcryptRounds).toBe(12);
  });

  it('can disable Swagger and background jobs', () => {
    expect(getAppConfig(env({ SWAGGER_ENABLED: 'false' })).swaggerEnabled).toBe(
      false,
    );
    expect(getAppConfig(env({ NODE_ENV: 'test' })).backgroundJobsEnabled).toBe(
      false,
    );
    expect(
      getAppConfig(env({ NODE_ENV: 'production' })).backgroundJobsEnabled,
    ).toBe(true);
    expect(
      getAppConfig(
        env({ NODE_ENV: 'production', DISABLE_BACKGROUND_JOBS: 'true' }),
      ).backgroundJobsEnabled,
    ).toBe(false);
  });
});

describe('validateEnv (secrets and durations)', () => {
  const base = {
    DATABASE_URL: 'x',
    JWT_ACCESS_SECRET: 'a'.repeat(40),
  };
  it('no longer requires (or compares) JWT_REFRESH_SECRET', () => {
    expect(() => validateEnv(env(base))).not.toThrow();
    expect(() =>
      validateEnv(env({ ...base, JWT_REFRESH_SECRET: base.JWT_ACCESS_SECRET })),
    ).not.toThrow();
  });
  it('requires FRONTEND_URL in production (no localhost CORS fallback)', () => {
    const prod = { ...base, NODE_ENV: 'production' };
    expect(() => validateEnv(env(prod))).toThrow(/FRONTEND_URL is required/);
    expect(() =>
      validateEnv(env({ ...prod, FRONTEND_URL: 'https://app.example.com' })),
    ).not.toThrow();
  });
  it('refuses DISABLE_THROTTLE in production', () => {
    expect(() =>
      validateEnv(
        env({
          ...base,
          NODE_ENV: 'production',
          FRONTEND_URL: 'https://app.example.com',
          DISABLE_THROTTLE: 'true',
        }),
      ),
    ).toThrow(/DISABLE_THROTTLE/);
  });
  it('keeps Swagger off by default in production, on elsewhere', () => {
    expect(getAppConfig(env({ NODE_ENV: 'production' })).swaggerEnabled).toBe(
      false,
    );
    expect(
      getAppConfig(env({ NODE_ENV: 'production', SWAGGER_ENABLED: 'true' }))
        .swaggerEnabled,
    ).toBe(true);
    expect(getAppConfig(env({ NODE_ENV: 'development' })).swaggerEnabled).toBe(
      true,
    );
  });
  it('rejects short secrets in production only', () => {
    const weak = {
      ...base,
      JWT_ACCESS_SECRET: 'short',
      NODE_ENV: 'production',
    };
    expect(() => validateEnv(env(weak))).toThrow(/at least 32 characters/);
    expect(() =>
      validateEnv(env({ ...weak, NODE_ENV: 'development' })),
    ).not.toThrow();
  });
  it('rejects a malformed duration at startup', () => {
    expect(() => validateEnv(env({ ...base, JWT_EXPIRES_IN: 'soon' }))).toThrow(
      /Invalid duration/,
    );
  });

  it('treats empty S3 endpoint/region (docker compose passes "") as unset', () => {
    const cfg = getAppConfig(
      env({ AWS_S3_ENDPOINT: '', AWS_REGION: ' ', JWT_ACCESS_SECRET: 'x' }),
    );
    expect(cfg.s3.endpoint).toBeUndefined();
    expect(cfg.s3.region).toBeUndefined();
  });

  it('picks the mail transport: explicit, else smtp when SMTP_URL is set, else console', () => {
    expect(getAppConfig(env({ MAIL_TRANSPORT: 'memory' })).mail.transport).toBe(
      'memory',
    );
    expect(getAppConfig(env({ SMTP_URL: 'smtp://h:25' })).mail.transport).toBe(
      'smtp',
    );
    expect(getAppConfig(env({})).mail.transport).toBe('console');
    expect(getAppConfig(env({ MAIL_TRANSPORT: 'bogus' })).mail.transport).toBe(
      'console',
    );
  });

  it('refuses the in-memory mail transport in production', () => {
    expect(() =>
      validateEnv(
        env({
          DATABASE_URL: 'postgresql://x',
          JWT_ACCESS_SECRET: 'a'.repeat(40),
          NODE_ENV: 'production',
          FRONTEND_URL: 'https://app.example.com',
          MAIL_TRANSPORT: 'memory',
        }),
      ),
    ).toThrow(/MAIL_TRANSPORT=memory/);
  });
});
