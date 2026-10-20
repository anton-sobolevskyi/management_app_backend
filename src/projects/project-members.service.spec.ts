import { Test, TestingModule } from '@nestjs/testing';
import { ProjectMembersService } from './project-members.service';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../generated/prisma/enums';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

describe('ProjectMembersService', () => {
  let service: ProjectMembersService;

  const mockPrisma = {
    user: { findFirst: jest.fn() },
    projectMember: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectMembersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(ProjectMembersService);
    jest.clearAllMocks();
  });

  describe('add', () => {
    it('adds a member by email', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'u2',
        email: 'bob@example.com',
      });
      mockPrisma.projectMember.findUnique.mockResolvedValue(null);
      mockPrisma.projectMember.create.mockResolvedValue({
        id: 'm1',
        userId: 'u2',
        projectId: 'p1',
        role: Role.MEMBER,
      });

      const result = await service.add('p1', {
        email: 'bob@example.com',
        role: Role.MEMBER,
      });

      expect(result.userId).toBe('u2');
    });

    it('rejects assigning OWNER via add', async () => {
      await expect(
        service.add('p1', { email: 'a@b.com', role: Role.OWNER }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects unknown email', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(
        service.add('p1', { email: 'missing@example.com' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects duplicate membership', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'u2' });
      mockPrisma.projectMember.findUnique.mockResolvedValue({ id: 'm1' });
      await expect(
        service.add('p1', { email: 'bob@example.com' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('updateRole', () => {
    it('blocks ADMIN from changing OWNER role', async () => {
      mockPrisma.projectMember.findUnique
        .mockResolvedValueOnce({ role: Role.ADMIN })
        .mockResolvedValueOnce({
          id: 'm1',
          userId: 'u1',
          projectId: 'p1',
          role: Role.OWNER,
        });

      await expect(
        service.updateRole('p1', 'u1', { role: Role.ADMIN }, 'admin'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('allows self-leave for MEMBER', async () => {
      mockPrisma.projectMember.findUnique
        .mockResolvedValueOnce({ role: Role.MEMBER, userId: 'u2' })
        .mockResolvedValueOnce({
          id: 'm2',
          userId: 'u2',
          role: Role.MEMBER,
        });
      mockPrisma.projectMember.delete.mockResolvedValue({
        id: 'm2',
        userId: 'u2',
      });

      await service.remove('p1', 'u2', 'u2');
      expect(mockPrisma.projectMember.delete).toHaveBeenCalled();
    });

    it('blocks MEMBER from removing others', async () => {
      mockPrisma.projectMember.findUnique
        .mockResolvedValueOnce({ role: Role.MEMBER, userId: 'u2' })
        .mockResolvedValueOnce({
          id: 'm3',
          userId: 'u3',
          role: Role.MEMBER,
        });

      await expect(service.remove('p1', 'u3', 'u2')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('blocks removing the last OWNER', async () => {
      mockPrisma.projectMember.findUnique
        .mockResolvedValueOnce({ role: Role.OWNER, userId: 'u1' })
        .mockResolvedValueOnce({
          id: 'm1',
          userId: 'u1',
          role: Role.OWNER,
        });
      mockPrisma.projectMember.count.mockResolvedValue(1);

      await expect(service.remove('p1', 'u1', 'u1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});
