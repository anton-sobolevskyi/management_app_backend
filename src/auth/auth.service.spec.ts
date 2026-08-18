import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

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
            user: { findUnique: jest.fn(), create: jest.fn() },
            refreshToken: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
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
    it('should throw ConflictException if email exists', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({ id: '1' } as any);
      await expect(service.register({ email: 'test@test.com', password: 'password', name: 'Test' })).rejects.toThrow(ConflictException);
    });

    it('should create user and return tokens', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedPassword' as any);
      jest.spyOn(prisma.user, 'create').mockResolvedValue({ id: '1', email: 'test@test.com' } as any);
      jest.spyOn(jwtService, 'sign').mockReturnValue('token');
      jest.spyOn(prisma.refreshToken, 'create').mockResolvedValue({} as any);

      const result = await service.register({ email: 'test@test.com', password: 'password', name: 'Test' });
      expect(result).toEqual({ accessToken: 'token', refreshToken: 'token' });
    });
  });

  describe('validateUser', () => {
    it('should return user if credentials valid', async () => {
      const user = { id: '1', email: 'test@test.com', passwordHash: 'hash' };
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(user as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true as any);

      const result = await service.validateUser('test@test.com', 'password');
      expect(result).toEqual({ id: '1', email: 'test@test.com' });
    });

    it('should return null if user not found', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);
      const result = await service.validateUser('test@test.com', 'password');
      expect(result).toBeNull();
    });
  });

  describe('refreshTokens', () => {
    it('should throw UnauthorizedException if token invalid', async () => {
      jest.spyOn(prisma.refreshToken, 'findUnique').mockResolvedValue(null);
      await expect(service.refreshTokens('invalid')).rejects.toThrow(UnauthorizedException);
    });
  });
});
