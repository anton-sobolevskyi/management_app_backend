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
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              findMany: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const dto = {
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
    };

    it('should hash password and create a user successfully', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedPassword');
      jest.spyOn(prisma.user, 'create').mockResolvedValue(mockUserResponse as any);

      const result = await service.create(dto);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: dto.email },
      });
      expect(bcrypt.hash).toHaveBeenCalledWith(dto.password, 10);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: dto.email,
          name: dto.name,
          passwordHash: 'hashedPassword',
        },
        select: {
          id: true,
          email: true,
          name: true,
          avatarId: true,
          createdAt: true,
        },
      });
      expect(result).toEqual(mockUserResponse);
    });

    it('should throw ConflictException if email is already taken', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({ id: 'existing' } as any);

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return all non-deleted users', async () => {
      jest.spyOn(prisma.user, 'findMany').mockResolvedValue([mockUserResponse] as any);

      const result = await service.findAll();

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        select: {
          id: true,
          email: true,
          name: true,
          avatarId: true,
          createdAt: true,
        },
      });
      expect(result).toEqual([mockUserResponse]);
    });
  });

  describe('findOne', () => {
    it('should return user if found and not deleted', async () => {
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(mockUserResponse as any);

      const result = await service.findOne('user-1');

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { id: 'user-1', deletedAt: null },
        select: {
          id: true,
          email: true,
          name: true,
          avatarId: true,
          createdAt: true,
        },
      });
      expect(result).toEqual(mockUserResponse);
    });

    it('should throw NotFoundException if user not found', async () => {
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(null);

      await expect(service.findOne('user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    const updateDto = { name: 'Updated Name' };

    it('should update and return the user if found', async () => {
      const updatedUser = { ...mockUserResponse, name: 'Updated Name' };
      jest.spyOn(service, 'findOne').mockResolvedValue(mockUserResponse);
      jest.spyOn(prisma.user, 'update').mockResolvedValue(updatedUser as any);

      const result = await service.update('user-1', updateDto);

      expect(service.findOne).toHaveBeenCalledWith('user-1');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: updateDto,
        select: {
          id: true,
          email: true,
          name: true,
          avatarId: true,
          createdAt: true,
        },
      });
      expect(result).toEqual(updatedUser);
    });

    it('should throw NotFoundException if user to update does not exist', async () => {
      jest.spyOn(service, 'findOne').mockRejectedValue(new NotFoundException());

      await expect(service.update('user-1', updateDto)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('softDelete', () => {
    it('should set deletedAt and return updated user', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(mockUserResponse);
      jest.spyOn(prisma.user, 'update').mockResolvedValue(mockUserResponse as any);

      const result = await service.softDelete('user-1');

      expect(service.findOne).toHaveBeenCalledWith('user-1');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { deletedAt: expect.any(Date) },
        select: {
          id: true,
          email: true,
          name: true,
          avatarId: true,
          createdAt: true,
        },
      });
      expect(result).toEqual(mockUserResponse);
    });

    it('should throw NotFoundException if user to soft delete does not exist', async () => {
      jest.spyOn(service, 'findOne').mockRejectedValue(new NotFoundException());

      await expect(service.softDelete('user-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});
