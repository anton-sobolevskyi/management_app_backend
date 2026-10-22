import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { hashToken } from '../common/utils/token-hash';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let jwtService: JwtService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: {
            user: { findFirst: jest.fn(), create: jest.fn() },
            refreshToken: {
              findUnique: jest.fn(),
              update: jest.fn(),
              create: jest.fn(),
              updateMany: jest.fn(),
              deleteMany: jest.fn(),
            },
          },
        },
        {
          provide: JwtService,
          useValue: { sign: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
  });

  describe('register', () => {
    it('stores a normalised email and hashes with the configured cost', async () => {
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed' as any);
      jest
        .spyOn(prisma.user, 'create')
        .mockResolvedValue({ id: '1', email: 'mixed@case.com' } as any);
      jest.spyOn(jwtService, 'sign').mockReturnValue('token');
      jest.spyOn(prisma.refreshToken, 'create').mockResolvedValue({} as any);

      await service.register({
        email: '  Mixed@Case.COM ',
        password: 'password1',
        name: 'Test',
      });

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { email: 'mixed@case.com', deletedAt: null },
      });
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: { email: 'mixed@case.com', passwordHash: 'hashed', name: 'Test' },
      });
      expect(bcrypt.hash).toHaveBeenCalledWith('password1', 12);
    });

    it('should throw ConflictException if email exists', async () => {
      jest
        .spyOn(prisma.user, 'findFirst')
        .mockResolvedValue({ id: '1' } as any);
      await expect(
        service.register({
          email: 'test@test.com',
          password: 'password1',
          name: 'Test',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should create user and return tokens', async () => {
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedPassword' as any);
      jest
        .spyOn(prisma.user, 'create')
        .mockResolvedValue({ id: '1', email: 'test@test.com' } as any);
      jest.spyOn(jwtService, 'sign').mockReturnValue('token');
      jest.spyOn(prisma.refreshToken, 'create').mockResolvedValue({} as any);

      const result = await service.register({
        email: 'test@test.com',
        password: 'password1',
        name: 'Test',
      });
      expect(result).toEqual({
        accessToken: 'token',
        refreshToken: 'token',
        expiresIn: 900,
      });
      expect(prisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ token: hashToken('token') }),
        }),
      );
    });
  });

  describe('validateUser', () => {
    it('looks the user up by normalised (trimmed, lower-case) email', async () => {
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('dummy' as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false as any);

      await service.validateUser('  Test@Test.COM ', 'password');

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { email: 'test@test.com', deletedAt: null },
      });
    });

    it('still runs a bcrypt comparison for unknown emails (no timing oracle)', async () => {
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('dummy-hash' as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false as any);

      const result = await service.validateUser('nobody@test.com', 'password');

      expect(result).toBeNull();
      expect(bcrypt.compare).toHaveBeenCalledWith('password', 'dummy-hash');
    });

    it('should return user if credentials valid', async () => {
      const user = { id: '1', email: 'test@test.com', passwordHash: 'hash' };
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(user as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true as any);

      const result = await service.validateUser('test@test.com', 'password');
      expect(result).toEqual({ id: '1', email: 'test@test.com' });
    });

    it('should return null if user not found', async () => {
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(null);
      const result = await service.validateUser('test@test.com', 'password');
      expect(result).toBeNull();
    });
  });

  describe('refreshTokens', () => {
    const future = new Date(Date.now() + 60_000);
    const stored = (overrides: object = {}) => ({
      id: 'rt-1',
      userId: 'u1',
      revoked: false,
      expiresAt: future,
      user: { id: 'u1', email: 'a@b.c', deletedAt: null },
      ...overrides,
    });

    it('should throw UnauthorizedException if token invalid', async () => {
      jest.spyOn(prisma.refreshToken, 'findUnique').mockResolvedValue(null);
      await expect(service.refreshTokens('invalid')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should rotate a valid token with a compare-and-set revoke', async () => {
      jest
        .spyOn(prisma.refreshToken, 'findUnique')
        .mockResolvedValue(stored() as any);
      jest
        .spyOn(prisma.refreshToken, 'updateMany')
        .mockResolvedValue({ count: 1 });
      jest.spyOn(jwtService, 'sign').mockReturnValue('new');
      jest.spyOn(prisma.refreshToken, 'create').mockResolvedValue({} as any);

      const result = await service.refreshTokens('old');

      expect(result).toEqual({
        accessToken: 'new',
        refreshToken: 'new',
        expiresIn: 900,
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: 'rt-1', revoked: false },
        data: { revoked: true },
      });
    });

    it('should reject the loser of a concurrent refresh without minting tokens', async () => {
      jest
        .spyOn(prisma.refreshToken, 'findUnique')
        .mockResolvedValue(stored() as any);
      jest
        .spyOn(prisma.refreshToken, 'updateMany')
        .mockResolvedValue({ count: 0 });

      await expect(service.refreshTokens('old')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('should revoke all sessions of the user when a revoked token is replayed', async () => {
      jest
        .spyOn(prisma.refreshToken, 'findUnique')
        .mockResolvedValue(stored({ revoked: true }) as any);
      jest
        .spyOn(prisma.refreshToken, 'updateMany')
        .mockResolvedValue({ count: 2 });

      await expect(service.refreshTokens('replayed')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', revoked: false },
        data: { revoked: true },
      });
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it.each([
      ['expired', { expiresAt: new Date(Date.now() - 1000) }],
      [
        'user deleted',
        { user: { id: 'u1', email: 'a@b.c', deletedAt: new Date() } },
      ],
    ])('should reject a token when %s', async (_label, overrides) => {
      jest
        .spyOn(prisma.refreshToken, 'findUnique')
        .mockResolvedValue(stored(overrides) as any);

      await expect(service.refreshTokens('t')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('refresh token uniqueness', () => {
    it('should sign every refresh token with a distinct jwtid', async () => {
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('h' as any);
      jest
        .spyOn(prisma.user, 'create')
        .mockResolvedValue({ id: '1', email: 'a@b.c' } as any);
      const sign = jest.spyOn(jwtService, 'sign').mockReturnValue('t');
      jest.spyOn(prisma.refreshToken, 'create').mockResolvedValue({} as any);

      const dto = { email: 'a@b.c', password: 'password1', name: 'Test' };
      await service.register(dto);
      await service.register(dto);

      const refreshCalls = sign.mock.calls.filter(
        ([, opts]) => (opts as any).expiresIn === 604800,
      );
      const ids = refreshCalls.map(([, opts]) => (opts as any).jwtid);
      expect(ids).toHaveLength(2);
      expect(ids[0]).toEqual(expect.any(String));
      expect(ids[0]).not.toEqual(ids[1]);
    });
  });
});
