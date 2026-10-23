import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  GlobalThrottlerGuard,
  SimpleThrottlerGuard,
} from './simple-throttler.guard';
import { InMemoryRateLimitStore } from './rate-limit.store';

function ctx(req: object): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => function login() {},
    getClass: () => class AuthController {},
  } as unknown as ExecutionContext;
}

describe('SimpleThrottlerGuard', () => {
  const originalEnv = process.env.NODE_ENV;
  let guard: SimpleThrottlerGuard;

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    delete process.env.DISABLE_THROTTLE;
    const reflector = new Reflector();
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue({ limit: 2, windowMs: 60_000 });
    guard = new SimpleThrottlerGuard(reflector);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('blocks after the limit', () => {
    const req = { ip: '1.1.1.1', headers: {} };
    expect(guard.canActivate(ctx(req))).toBe(true);
    expect(guard.canActivate(ctx(req))).toBe(true);
    expect(() => guard.canActivate(ctx(req))).toThrow(HttpException);
  });

  it('cannot be bypassed by rotating X-Forwarded-For', () => {
    const attempt = (spoofed: string) =>
      ctx({ ip: '2.2.2.2', headers: { 'x-forwarded-for': spoofed } });

    guard.canActivate(attempt('9.9.9.1'));
    guard.canActivate(attempt('9.9.9.2'));
    expect(() => guard.canActivate(attempt('9.9.9.3'))).toThrow(HttpException);
  });

  it('tracks different client IPs separately', () => {
    guard.canActivate(ctx({ ip: '3.3.3.1', headers: {} }));
    guard.canActivate(ctx({ ip: '3.3.3.1', headers: {} }));
    expect(guard.canActivate(ctx({ ip: '3.3.3.2', headers: {} }))).toBe(true);
  });

  it('limits per target email even when the IP keeps changing', () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
      limit: 100,
      windowMs: 60_000,
      perEmail: { limit: 2, windowMs: 60_000 },
    });
    const g = new SimpleThrottlerGuard(reflector);
    const attempt = (ip: string, email: unknown) =>
      ctx({ ip, headers: {}, body: { email } });

    expect(g.canActivate(attempt('7.7.7.1', 'Victim@Example.com'))).toBe(true);
    expect(g.canActivate(attempt('7.7.7.2', ' victim@example.com '))).toBe(
      true,
    );
    expect(() =>
      g.canActivate(attempt('7.7.7.3', 'victim@example.com')),
    ).toThrow(HttpException);
    // another account is unaffected
    expect(g.canActivate(attempt('7.7.7.4', 'other@example.com'))).toBe(true);
  });

  it('ignores a non-string email body instead of crashing', () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
      limit: 100,
      windowMs: 60_000,
      perEmail: { limit: 1, windowMs: 60_000 },
    });
    const g = new SimpleThrottlerGuard(reflector);
    expect(
      g.canActivate(ctx({ ip: '8.8.8.8', headers: {}, body: { email: {} } })),
    ).toBe(true);
  });

  it('is disabled by DISABLE_THROTTLE=true', () => {
    process.env.DISABLE_THROTTLE = 'true';
    const req = { ip: '4.4.4.4', headers: {} };
    for (let i = 0; i < 10; i++) {
      expect(guard.canActivate(ctx(req))).toBe(true);
    }
  });
});

describe('GlobalThrottlerGuard', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    delete process.env.DISABLE_THROTTLE;
    process.env.RATE_LIMIT_PER_MINUTE = '3';
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    delete process.env.RATE_LIMIT_PER_MINUTE;
  });

  it('applies a default per-IP ceiling to routes without @Throttle', () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const g = new GlobalThrottlerGuard(reflector);
    const req = { ip: '5.5.5.5', headers: {} };

    expect(g.canActivate(ctx(req))).toBe(true);
    expect(g.canActivate(ctx(req))).toBe(true);
    expect(g.canActivate(ctx(req))).toBe(true);
    expect(() => g.canActivate(ctx(req))).toThrow(HttpException);
    expect(g.canActivate(ctx({ ip: '5.5.5.6', headers: {} }))).toBe(true);
  });

  it('skips routes marked with @SkipGlobalThrottle (health probes)', () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    const g = new GlobalThrottlerGuard(reflector);
    for (let i = 0; i < 10; i++) {
      expect(g.canActivate(ctx({ ip: '6.6.6.6', headers: {} }))).toBe(true);
    }
  });
});

describe('InMemoryRateLimitStore', () => {
  it('counts within a window and resets after it', () => {
    const store = new InMemoryRateLimitStore();
    expect(store.hit('k', 1000, 0).count).toBe(1);
    expect(store.hit('k', 1000, 500).count).toBe(2);
    expect(store.hit('k', 1000, 1000).count).toBe(1);
  });
});
