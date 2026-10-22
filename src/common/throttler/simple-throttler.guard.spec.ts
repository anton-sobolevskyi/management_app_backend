import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SimpleThrottlerGuard } from './simple-throttler.guard';

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
});
