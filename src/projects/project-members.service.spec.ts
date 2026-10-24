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

  const mockPrisma: any = {
    user: { findFirst: jest.fn() },
    projectMember: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    task: { updateMany: jest.fn() },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
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
    mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockPrisma));
    mockPrisma.$queryRaw.mockResolvedValue([]);
  });

  describe('add', () => {
    // add() looks up the inviting user first, then the invited one
    const verifiedActor = { emailVerifiedAt: new Date() };

    it('adds a member by email', async () => {
      mockPrisma.user.findFirst
        .mockResolvedValueOnce(verifiedActor)
        .mockResolvedValueOnce({ id: 'u2', email: 'bob@example.com' });
      mockPrisma.projectMember.findUnique.mockResolvedValue(null);
      mockPrisma.projectMember.create.mockResolvedValue({
        id: 'm1',
        userId: 'u2',
        projectId: 'p1',
        role: Role.MEMBER,
      });

      const result = await service.add(
        'p1',
        { email: 'bob@example.com', role: Role.MEMBER },
        'u1',
      );

      expect(result.userId).toBe('u2');
    });

    it('looks up only verified users, by normalised email', async () => {
      mockPrisma.user.findFirst
        .mockResolvedValueOnce(verifiedActor)
        .mockResolvedValueOnce(null);

      await expect(
        service.add('p1', { email: '  Bob@Example.COM ' }, 'u1'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(mockPrisma.user.findFirst).toHaveBeenLastCalledWith({
        where: {
          email: 'bob@example.com',
          deletedAt: null,
          emailVerifiedAt: { not: null },
        },
      });
    });

    it('refuses to invite while the inviting user is unverified', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({
        emailVerifiedAt: null,
      });

      await expect(
        service.add('p1', { email: 'bob@example.com' }, 'u1'),
      ).rejects.toBeInstanceOf(ForbiddenException);

      // no lookup of the target, so nothing is revealed about it
      expect(mockPrisma.user.findFirst).toHaveBeenCalledTimes(1);
      expect(mockPrisma.projectMember.create).not.toHaveBeenCalled();
    });

    it('rejects assigning OWNER via add', async () => {
      await expect(
        service.add('p1', { email: 'a@b.com', role: Role.OWNER }, 'u1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('answers 404 for an unknown (or unverified) email', async () => {
      mockPrisma.user.findFirst
        .mockResolvedValueOnce(verifiedActor)
        .mockResolvedValueOnce(null);
      await expect(
        service.add('p1', { email: 'missing@example.com' }, 'u1'),
      ).rejects.toThrow('User not found');
    });

    it('rejects duplicate membership', async () => {
      mockPrisma.user.findFirst
        .mockResolvedValueOnce(verifiedActor)
        .mockResolvedValueOnce({ id: 'u2' });
      mockPrisma.projectMember.findUnique.mockResolvedValue({ id: 'm1' });
      await expect(
        service.add('p1', { email: 'bob@example.com' }, 'u1'),
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

    it('locks the project before checking owner counts', async () => {
      const order: string[] = [];
      mockPrisma.$queryRaw.mockImplementation(async () => {
        order.push('lock');
        return [];
      });
      mockPrisma.projectMember.findUnique
        .mockResolvedValueOnce({ id: 'a', role: Role.OWNER })
        .mockResolvedValueOnce({ id: 'm1', userId: 'u2', role: Role.OWNER });
      mockPrisma.projectMember.count.mockImplementation(async () => {
        order.push('count');
        return 2;
      });
      mockPrisma.projectMember.update.mockResolvedValue({ id: 'm1' });

      await service.updateRole('p1', 'u2', { role: Role.MEMBER }, 'u1');

      expect(order).toEqual(['lock', 'count']);
    });

    it('refuses to demote the last OWNER', async () => {
      mockPrisma.projectMember.findUnique
        .mockResolvedValueOnce({ id: 'a', role: Role.OWNER })
        .mockResolvedValueOnce({ id: 'm1', userId: 'u1', role: Role.OWNER });
      mockPrisma.projectMember.count.mockResolvedValue(1);

      await expect(
        service.updateRole('p1', 'u1', { role: Role.ADMIN }, 'u1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.projectMember.update).not.toHaveBeenCalled();
    });
  });

  describe('transferOwnership', () => {
    it('swaps OWNER and ADMIN inside one locked transaction', async () => {
      mockPrisma.projectMember.findUnique
        .mockResolvedValueOnce({ id: 'a', role: Role.OWNER })
        .mockResolvedValueOnce({ id: 't', role: Role.MEMBER });
      mockPrisma.projectMember.update.mockResolvedValue({ id: 't' });

      await service.transferOwnership('p1', 'u2', 'u1');

      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(mockPrisma.projectMember.update).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ data: { role: Role.ADMIN } }),
      );
      expect(mockPrisma.projectMember.update).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ data: { role: Role.OWNER } }),
      );
    });

    it('only the OWNER may transfer', async () => {
      mockPrisma.projectMember.findUnique.mockResolvedValueOnce({
        id: 'a',
        role: Role.ADMIN,
      });
      await expect(
        service.transferOwnership('p1', 'u2', 'u1'),
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

    it('unassigns the removed member from their tasks in the same transaction', async () => {
      mockPrisma.projectMember.findUnique
        .mockResolvedValueOnce({ role: Role.ADMIN, userId: 'u1' })
        .mockResolvedValueOnce({ id: 'm3', userId: 'u3', role: Role.MEMBER });
      mockPrisma.task.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.projectMember.delete.mockResolvedValue({ id: 'm3' });

      await service.remove('p1', 'u3', 'u1');

      expect(mockPrisma.task.updateMany).toHaveBeenCalledWith({
        where: { projectId: 'p1', assignedToId: 'u3' },
        data: { assignedToId: null },
      });
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('does not unassign anything when the removal is refused', async () => {
      mockPrisma.projectMember.findUnique
        .mockResolvedValueOnce({ role: Role.MEMBER, userId: 'u2' })
        .mockResolvedValueOnce({ id: 'm3', userId: 'u3', role: Role.MEMBER });

      await expect(service.remove('p1', 'u3', 'u2')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(mockPrisma.task.updateMany).not.toHaveBeenCalled();
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
