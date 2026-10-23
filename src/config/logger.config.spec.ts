import { getLoggerParams, resolveRequestId } from './logger.config';

const env = (e: Record<string, string>) => e as NodeJS.ProcessEnv;

describe('logger.config', () => {
  const http = (e: Record<string, string>) =>
    (getLoggerParams(env(e)) as any).pinoHttp;

  it('is silent under test, info in production, debug elsewhere', () => {
    expect(http({ NODE_ENV: 'test' }).level).toBe('silent');
    expect(http({ NODE_ENV: 'production' }).level).toBe('info');
    expect(http({ NODE_ENV: 'development' }).level).toBe('debug');
    expect(http({ NODE_ENV: 'production', LOG_LEVEL: 'warn' }).level).toBe(
      'warn',
    );
  });

  it('redacts credentials', () => {
    expect(http({}).redact.paths).toEqual(
      expect.arrayContaining([
        'req.headers.authorization',
        'req.headers.cookie',
      ]),
    );
  });

  it('keeps a safe client request id and replaces an unsafe one', () => {
    expect(resolveRequestId('abc-123')).toBe('abc-123');
    expect(resolveRequestId('bad id\nwith newline')).not.toContain('\n');
    expect(resolveRequestId(undefined)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('genReqId sets the header on request and response', () => {
    const req: any = { headers: { 'x-request-id': 'trace-1' } };
    const res: any = { setHeader: jest.fn() };
    expect(http({}).genReqId(req, res)).toBe('trace-1');
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'trace-1');
  });

  it('does not log health probes', () => {
    const { ignore } = http({}).autoLogging;
    expect(ignore({ url: '/health' })).toBe(true);
    expect(ignore({ url: '/?x=1' })).toBe(true);
    expect(ignore({ url: '/projects' })).toBe(false);
  });

  it('maps status codes to log levels', () => {
    const level = http({}).customLogLevel;
    expect(level({}, { statusCode: 200 })).toBe('info');
    expect(level({}, { statusCode: 404 })).toBe('warn');
    expect(level({}, { statusCode: 500 })).toBe('error');
    expect(level({}, { statusCode: 200 }, new Error('x'))).toBe('error');
  });
});
