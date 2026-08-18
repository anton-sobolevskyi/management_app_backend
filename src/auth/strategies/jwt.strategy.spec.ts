import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = 'test-secret';
    strategy = new JwtStrategy();
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  it('should validate payload', async () => {
    const payload = { sub: '123', email: 'test@test.com' };
    const result = await strategy.validate(payload);
    expect(result).toEqual({ userId: '123', email: 'test@test.com' });
  });
});
