import { JwtStrategy } from './jwt.strategy';
import { UnauthorizedException } from '@nestjs/common';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  const mockPrisma = {
    user: { findFirst: jest.fn() },
  };

  beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = 'test-secret';
    strategy = new JwtStrategy(mockPrisma as any);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  it('should validate active user payload', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: '123',
      email: 'test@test.com',
    });
    const result = await strategy.validate({
      sub: '123',
      email: 'test@test.com',
    });
    expect(result).toEqual({ userId: '123', email: 'test@test.com' });
  });

  it('should reject deleted or missing user', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    await expect(
      strategy.validate({ sub: '123', email: 'test@test.com' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
