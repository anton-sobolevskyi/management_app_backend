import { UnauthorizedException } from '@nestjs/common';
import { LocalStrategy } from './local.strategy';

describe('LocalStrategy', () => {
  const authService: any = { validateUser: jest.fn() };
  const strategy = new LocalStrategy(authService);

  it('returns the same { userId, email } shape as the JWT strategy', async () => {
    authService.validateUser.mockResolvedValue({
      id: 'u1',
      email: 'a@b.c',
      name: 'A',
    });
    await expect(strategy.validate('a@b.c', 'pw')).resolves.toEqual({
      userId: 'u1',
      email: 'a@b.c',
    });
  });

  it('401s on bad credentials', async () => {
    authService.validateUser.mockResolvedValue(null);
    await expect(strategy.validate('a@b.c', 'bad')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
