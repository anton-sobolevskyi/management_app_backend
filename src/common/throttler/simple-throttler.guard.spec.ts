import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  GlobalThrottlerGuard,
  SimpleThrottlerGuard,
  ThrottleOptions,
} from './simple-throttler.guard';
import { InMemoryRateLimitStore, RateLimitStore } from './rate-limit.store';
import { AppConfigService } from '../../config/app-config.service';

function ctx(req: object): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => function login() {},
    getClass: () => class AuthController {},
  } as unknown as ExecutionContext;
}

function reflectorReturning(value: unknown): Reflector {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(value);
  return reflector;
}

const config = (env: NodeJS.ProcessEnv = {}) =>
  new AppConfigService({ NODE_ENV: 'development', ...env });

function simpleGuard(
  options: ThrottleOptions | undefined,
  env: NodeJS.ProcessEnv = {},
  store: RateLimitStore = new InMemoryRateLimitStore(),
) {
  return new SimpleThrottlerGuard(
    reflectorReturning(options),
    store,
    config(env),
  );
}

describe('SimpleThrottlerGuard', () => {
  it('blocks after the limit', async () => {
    const guard = simpleGuard({ limit: 2, windowMs: 60_000 });
    const req = { ip: '1.1.1.1', headers: {} };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    await expect(guard.canActivate(ctx(req))).rejects.toThrow(HttpException);
  });

  it('cannot be bypassed by rotating X-Forwarded-For', async () => {
    const guard = simpleGuard({ limit: 2, windowMs: 60_000 });
    const attempt = (spoofed: string) =>
      ctx({ ip: '2.2.2.2', headers: { 'x-forwarded-for': spoofed } });
    await guard.canActivate(attempt('9.9.9.1'));
    await guard.canActivate(attempt('9.9.9.2'));
    await expect(guard.canActivate(attempt('9.9.9.3'))).rejects.toThrow(
      HttpException,
    );
  });

  it('tracks different client IPs separately', async () => {
    const guard = simpleGuard({ limit: 2, windowMs: 60_000 });
    await guard.canActivate(ctx({ ip: '3.3.3.1', headers: {} }));
    await guard.canActivate(ctx({ ip: '3.3.3.1', headers: {} }));
    await expect(
      guard.canActivate(ctx({ ip: '3.3.3.2', headers: {} })),
    ).resolves.toBe(true);
  });

  it('limits per target email even when the IP keeps changing', async () => {
    const g = simpleGuard({
      limit: 100,
      windowMs: 60_000,
      perEmail: { limit: 2, windowMs: 60_000 },
    });
    const attempt = (ip: string, email: unknown) =>
      ctx({ ip, headers: {}, body: { email } });

    await expect(
      g.canActivate(attempt('7.7.7.1', 'Victim@Example.com')),
    ).resolves.toBe(true);
    await expect(
      g.canActivate(attempt('7.7.7.2', ' victim@example.com ')),
    ).resolves.toBe(true);
    await expect(
      g.canActivate(attempt('7.7.7.3', 'victim@example.com')),
    ).rejects.toThrow(HttpException);
    // another account is unaffected
    await expect(
      g.canActivate(attempt('7.7.7.4', 'other@example.com')),
    ).resolves.toBe(true);
  });

  it('ignores a non-string email body instead of crashing', async () => {
    const g = simpleGuard({
      limit: 100,
      windowMs: 60_000,
      perEmail: { limit: 1, windowMs: 60_000 },
    });
    await expect(
      g.canActivate(ctx({ ip: '8.8.8.8', headers: {}, body: { email: {} } })),
    ).resolves.toBe(true);
  });

  it('is disabled by DISABLE_THROTTLE=true', async () => {
    const guard = simpleGuard(
      { limit: 1, windowMs: 60_000 },
      { DISABLE_THROTTLE: 'true' },
    );
    const req = { ip: '4.4.4.4', headers: {} };
    for (let i = 0; i < 10; i++) {
      await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    }
  });

  it('is NOT disabled by NODE_ENV=test alone (fails closed)', async () => {
    const guard = simpleGuard(
      { limit: 1, windowMs: 60_000 },
      { NODE_ENV: 'test' },
    );
    const req = { ip: '4.4.4.5', headers: {} };
    await guard.canActivate(ctx(req));
    await expect(guard.canActivate(ctx(req))).rejects.toThrow(HttpException);
  });

  it('ignores DISABLE_THROTTLE in production', async () => {
    const guard = simpleGuard(
      { limit: 1, windowMs: 60_000 },
      { NODE_ENV: 'production', DISABLE_THROTTLE: 'true' },
    );
    const req = { ip: '4.4.4.6', headers: {} };
    await guard.canActivate(ctx(req));
    await expect(guard.canActivate(ctx(req))).rejects.toThrow(HttpException);
  });

  it('works with any asynchronous store (e.g. Redis-backed)', async () => {
    const hit = jest
      .fn()
      .mockResolvedValueOnce({ count: 1, resetAt: Date.now() + 1000 })
      .mockResolvedValueOnce({ count: 2, resetAt: Date.now() + 1000 });
    const guard = simpleGuard({ limit: 1, windowMs: 1000 }, {}, { hit });
    const req = { ip: '4.4.4.7', headers: {} };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    await expect(guard.canActivate(ctx(req))).rejects.toThrow(HttpException);
    expect(hit).toHaveBeenCalledTimes(2);
  });
});

describe('GlobalThrottlerGuard', () => {
  const globalGuard = (skip: unknown, env: NodeJS.ProcessEnv = {}) =>
    new GlobalThrottlerGuard(
      reflectorReturning(skip),
      new InMemoryRateLimitStore(),
      config({ RATE_LIMIT_PER_MINUTE: '3', ...env }),
    );

  it('applies a default per-IP ceiling to routes without @Throttle', async () => {
    const g = globalGuard(undefined);
    const req = { ip: '5.5.5.5', headers: {} };

    await expect(g.canActivate(ctx(req))).resolves.toBe(true);
    await expect(g.canActivate(ctx(req))).resolves.toBe(true);
    await expect(g.canActivate(ctx(req))).resolves.toBe(true);
    await expect(g.canActivate(ctx(req))).rejects.toThrow(HttpException);
    await expect(
      g.canActivate(ctx({ ip: '5.5.5.6', headers: {} })),
    ).resolves.toBe(true);
  });

  it('skips routes marked with @SkipGlobalThrottle (health probes)', async () => {
    const g = globalGuard(true);
    for (let i = 0; i < 10; i++) {
      await expect(
        g.canActivate(ctx({ ip: '6.6.6.6', headers: {} })),
      ).resolves.toBe(true);
    }
  });

  it('is not disabled by NODE_ENV=test alone', async () => {
    const g = globalGuard(undefined, { NODE_ENV: 'test' });
    const req = { ip: '6.6.6.7', headers: {} };
    for (let i = 0; i < 3; i++) await g.canActivate(ctx(req));
    await expect(g.canActivate(ctx(req))).rejects.toThrow(HttpException);
  });
});

describe('InMemoryRateLimitStore', () => {
  it('counts within a window and resets after it', async () => {
    const store = new InMemoryRateLimitStore();
    expect((await store.hit('k', 1000, 0)).count).toBe(1);
    expect((await store.hit('k', 1000, 500)).count).toBe(2);
    expect((await store.hit('k', 1000, 1000)).count).toBe(1);
  });

  it('sweeps expired buckets without scanning on every hit', async () => {
    const store = new InMemoryRateLimitStore();
    for (let i = 0; i < 10_001; i++) await store.hit(`old-${i}`, 1000, 0);
    const buckets = (store as any).buckets as Map<string, unknown>;
    expect(buckets.size).toBe(10_001);

    // Past expiry and past the minimum sweep interval: one scan clears them
    await store.hit('fresh', 1000, 20_000);
    expect(buckets.size).toBe(1);

    // Many live buckets are kept, and a second sweep inside the interval is skipped
    for (let i = 0; i < 10_001; i++)
      await store.hit(`live-${i}`, 60_000, 20_001);
    const before = buckets.size;
    await store.hit('another', 60_000, 20_002);
    expect(buckets.size).toBe(before + 1);
  });
});
