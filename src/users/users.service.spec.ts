import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaService;

  const mockUserResponse = {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    avatarId: null,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findFirst: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            refreshToken: {
              updateMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const dto = {
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
    };

    it('should hash password and create a user successfully', async () => {
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedPassword');
      jest
        .spyOn(prisma.user, 'create')
        .mockResolvedValue(mockUserResponse as any);

      const result = await service.create(dto);

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { email: dto.email, deletedAt: null },
      });
      expect(result).toEqual(mockUserResponse);
    });

    it('should throw ConflictException if email is already taken', async () => {
      jest
        .spyOn(prisma.user, 'findFirst')
        .mockResolvedValue({ id: 'existing' } as any);

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('findOne', () => {
    it('should return user if found', async () => {
      jest
        .spyOn(prisma.user, 'findFirst')
        .mockResolvedValue(mockUserResponse as any);

      const result = await service.findOne('user-1');
      expect(result).toEqual(mockUserResponse);
    });

    it('should throw NotFoundException if user not found', async () => {
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(null);
      await expect(service.findOne('user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('softDelete', () => {
    it('should free email, revoke tokens, and soft delete', async () => {
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
      } as any);
      jest.spyOn(prisma.refreshToken, 'updateMany').mockResolvedValue({ count: 1 } as any);
      jest
        .spyOn(prisma.user, 'update')
        .mockResolvedValue(mockUserResponse as any);

      await service.softDelete('user-1');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deletedAt: expect.any(Date),
            email: expect.stringContaining('deleted+user-1'),
          }),
        }),
      );
    });
  });
});
