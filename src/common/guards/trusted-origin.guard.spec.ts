import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { TrustedOriginGuard } from './trusted-origin.guard';

function ctx(origin: string | undefined, host = 'api.example.com') {
  const req = {
    headers: origin === undefined ? {} : { origin },
    get: (name: string) => (name.toLowerCase() === 'host' ? host : undefined),
  };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('TrustedOriginGuard', () => {
  const guard = new TrustedOriginGuard();
  const original = process.env.FRONTEND_URL;

  beforeEach(() => {
    process.env.FRONTEND_URL =
      'https://app.example.com, http://localhost:5173/';
  });
  afterEach(() => {
    if (original === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = original;
  });

  it('allows requests without Origin (non-browser clients)', () => {
    expect(guard.canActivate(ctx(undefined))).toBe(true);
  });

  it.each(['https://app.example.com', 'http://localhost:5173'])(
    'allows configured origin %s',
    (origin) => {
      expect(guard.canActivate(ctx(origin))).toBe(true);
    },
  );

  it('allows same-origin requests such as Swagger UI', () => {
    expect(guard.canActivate(ctx('https://api.example.com'))).toBe(true);
  });

  it.each(['https://evil.example', 'null', 'not a url'])(
    'rejects %s',
    (origin) => {
      expect(() => guard.canActivate(ctx(origin))).toThrow(ForbiddenException);
    },
  );
});
