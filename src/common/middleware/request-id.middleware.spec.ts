import { RequestIdMiddleware } from './request-id.middleware';

function run(incoming?: string) {
  const req: any = {
    headers: incoming === undefined ? {} : { 'x-request-id': incoming },
  };
  const res: any = { setHeader: jest.fn() };
  const next = jest.fn();
  new RequestIdMiddleware().use(req, res, next);
  return { req, res, next };
}

describe('RequestIdMiddleware', () => {
  it('generates an id when none is sent and exposes it on request and response', () => {
    const { req, res, next } = run();
    const id = req.headers['x-request-id'];
    expect(id).toEqual(expect.any(String));
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', id);
    expect(next).toHaveBeenCalled();
  });

  it('keeps a well-formed client id', () => {
    const { req } = run('trace-123.abc_DEF');
    expect(req.headers['x-request-id']).toBe('trace-123.abc_DEF');
  });

  it.each(['x'.repeat(129), 'has space', 'a\nb', '<script>', ''])(
    'replaces an unsafe id (%j)',
    (bad) => {
      const { req } = run(bad);
      expect(req.headers['x-request-id']).not.toBe(bad);
      expect(req.headers['x-request-id']).toMatch(/^[A-Za-z0-9._-]{1,128}$/);
    },
  );
});
