import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { PrismaService } from '../prisma/prisma.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { Role } from '../generated/prisma/enums';

describe('ProjectsService', () => {
  let service: ProjectsService;

  const mockProject = {
    id: 'project-1',
    name: 'Project Alpha',
    description: 'Description Alpha',
    deletedAt: null,
    members: [{ userId: 'user-1', role: Role.OWNER }],
  };

  const mockPrisma: any = {
    project: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    task: { findMany: jest.fn(), updateMany: jest.fn(), groupBy: jest.fn() },
    comment: { findMany: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
  };

  const mockAttachments = {
    detachFor: jest.fn(),
    purgeObjects: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AttachmentsService, useValue: mockAttachments },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockPrisma));
  });

  describe('create', () => {
    it('should create a project', async () => {
      mockPrisma.project.create.mockResolvedValue(mockProject);
      const result = await service.create(
        { name: 'Project Alpha', description: 'Description Alpha' },
        'user-1',
      );
      expect(result).toEqual(mockProject);
    });
  });

  describe('findAll', () => {
    it('returns a capped member preview plus memberCount, newest first', async () => {
      mockPrisma.project.count.mockResolvedValue(1);
      mockPrisma.project.findMany.mockResolvedValue([
        { ...mockProject, _count: { members: 57 } },
      ]);
      mockPrisma.task.groupBy.mockResolvedValue([]);

      const result = await service.findAll('user-1');

      expect(result.data).toEqual([
        { ...mockProject, memberCount: 57, taskCount: 0, doneTaskCount: 0 },
      ]);
      expect(result.data[0]).not.toHaveProperty('_count');
      expect(result.meta.total).toBe(1);

      const args = mockPrisma.project.findMany.mock.calls[0][0];
      expect(args.include.members.take).toBe(20);
      expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    });

    it('adds total and finished task counts per project', async () => {
      mockPrisma.project.count.mockResolvedValue(2);
      mockPrisma.project.findMany.mockResolvedValue([
        { ...mockProject, _count: { members: 1 } },
        { ...mockProject, id: 'project-2', _count: { members: 1 } },
      ]);
      mockPrisma.task.groupBy.mockResolvedValue([
        { projectId: 'project-1', status: 'TODO', _count: { _all: 3 } },
        { projectId: 'project-1', status: 'DONE', _count: { _all: 2 } },
      ]);

      const result = await service.findAll('user-1');

      expect(result.data[0]).toMatchObject({ taskCount: 5, doneTaskCount: 2 });
      expect(result.data[1]).toMatchObject({ taskCount: 0, doneTaskCount: 0 });

      const args = mockPrisma.task.groupBy.mock.calls[0][0];
      expect(args.where).toEqual({
        projectId: { in: ['project-1', 'project-2'] },
        deletedAt: null,
      });
    });
  });

  describe('findOne', () => {
    it('returns the project with a capped member list and memberCount', async () => {
      mockPrisma.project.findFirst.mockResolvedValue({
        ...mockProject,
        _count: { members: 250 },
      });

      const result = await service.findOne('project-1');

      expect(result).toEqual({ ...mockProject, memberCount: 250 });
      expect(result).not.toHaveProperty('_count');
      const args = mockPrisma.project.findFirst.mock.calls[0][0];
      expect(args.include.members.take).toBe(100);
    });

    it('should throw NotFoundException if project not found', async () => {
      mockPrisma.project.findFirst.mockResolvedValue(null);
      await expect(service.findOne('project-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('softDelete', () => {
    beforeEach(() => {
      mockPrisma.project.findFirst.mockResolvedValue(mockProject);
      mockPrisma.comment.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.task.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.project.update.mockResolvedValue(mockProject);
    });

    it('cascades in one transaction and purges files only after commit', async () => {
      const stored = [{ s3Bucket: 'b', s3Key: 'k' }];
      const order: string[] = [];
      mockAttachments.detachFor.mockResolvedValue(stored);
      mockPrisma.$transaction.mockImplementation(async (cb: any) => {
        const result = await cb(mockPrisma);
        order.push('commit');
        return result;
      });
      mockAttachments.purgeObjects.mockImplementation(async () => {
        order.push('purge');
      });

      await service.softDelete('project-1');

      // relation filters, not loaded id lists
      expect(mockAttachments.detachFor).toHaveBeenCalledWith(mockPrisma, {
        projectId: 'project-1',
      });
      expect(mockPrisma.comment.updateMany).toHaveBeenCalledWith({
        where: { deletedAt: null, task: { projectId: 'project-1' } },
        data: { deletedAt: expect.any(Date) },
      });
      expect(mockPrisma.task.updateMany).toHaveBeenCalled();
      expect(mockPrisma.task.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.project.update).toHaveBeenCalled();
      expect(mockAttachments.purgeObjects).toHaveBeenCalledWith(stored);
      expect(order).toEqual(['commit', 'purge']);
    });

    it('uses a light existence check instead of loading all members', async () => {
      mockAttachments.detachFor.mockResolvedValue([]);
      await service.softDelete('project-1');
      expect(mockPrisma.project.findFirst).toHaveBeenCalledWith({
        where: { id: 'project-1', deletedAt: null },
        select: { id: true },
      });
    });

    it('404s for a missing project without opening a transaction', async () => {
      mockPrisma.project.findFirst.mockResolvedValue(null);
      await expect(service.softDelete('nope')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('keeps files and leaves nothing half-deleted when a step fails', async () => {
      mockAttachments.detachFor.mockResolvedValue([
        { s3Bucket: 'b', s3Key: 'k' },
      ]);
      mockPrisma.task.updateMany.mockRejectedValue(new Error('boom'));

      await expect(service.softDelete('project-1')).rejects.toThrow('boom');

      expect(mockAttachments.purgeObjects).not.toHaveBeenCalled();
    });
  });
});
