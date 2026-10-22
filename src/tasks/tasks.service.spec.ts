import { Test, TestingModule } from '@nestjs/testing';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('TasksService', () => {
  let service: TasksService;

  const mockPrisma: any = {
    task: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    comment: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    projectMember: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockAttachments = {
    detachFor: jest.fn(),
    purgeObjects: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AttachmentsService, useValue: mockAttachments },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockPrisma));
  });

  it('should create a task', async () => {
    const dto = { title: 'Test Task', description: 'Desc' } as any;
    const mockTask = { id: '1', ...dto };
    mockPrisma.task.create.mockResolvedValue(mockTask);

    const result = await service.create('proj-1', dto, 'user-1');
    expect(result).toEqual(mockTask);
  });

  it('should reject assignee who is not a project member', async () => {
    mockPrisma.projectMember.findUnique.mockResolvedValue(null);
    await expect(
      service.create(
        'proj-1',
        { title: 'T', assignedToId: 'stranger' } as any,
        'user-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw NotFoundException if task not found', async () => {
    mockPrisma.task.findFirst.mockResolvedValue(null);
    await expect(service.findOne('invalid-id')).rejects.toThrow(
      NotFoundException,
    );
  });

  describe('softDelete', () => {
    beforeEach(() => {
      mockPrisma.task.findFirst.mockResolvedValue({ id: '1' });
      mockPrisma.comment.findMany.mockResolvedValue([{ id: 'c1' }]);
      mockPrisma.comment.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.task.update.mockResolvedValue({
        id: '1',
        deletedAt: new Date(),
      });
    });

    it('soft deletes task and comments atomically, purging files after commit', async () => {
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

      await service.softDelete('1');

      expect(mockAttachments.detachFor).toHaveBeenCalledWith(mockPrisma, {
        taskIds: ['1'],
        commentIds: ['c1'],
      });
      expect(mockPrisma.comment.updateMany).toHaveBeenCalled();
      expect(mockAttachments.purgeObjects).toHaveBeenCalledWith(stored);
      expect(order).toEqual(['commit', 'purge']);
    });

    it('does not touch files when the transaction fails', async () => {
      mockAttachments.detachFor.mockResolvedValue([
        { s3Bucket: 'b', s3Key: 'k' },
      ]);
      mockPrisma.task.update.mockRejectedValue(new Error('boom'));

      await expect(service.softDelete('1')).rejects.toThrow('boom');
      expect(mockAttachments.purgeObjects).not.toHaveBeenCalled();
    });

    it('404s for a task that is already deleted', async () => {
      mockPrisma.task.findFirst.mockResolvedValue(null);
      await expect(service.softDelete('1')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should exclude soft-deleted comments', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({ id: '1', comments: [] });

      await service.findOne('1');

      expect(mockPrisma.task.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            comments: expect.objectContaining({ where: { deletedAt: null } }),
          }),
        }),
      );
    });

    it('never exposes storage keys of attachments', async () => {
      mockPrisma.task.findFirst.mockResolvedValue({ id: '1' });

      await service.findOne('1');

      const { include } = mockPrisma.task.findFirst.mock.calls[0][0];
      expect(include.attachments.select).toBeDefined();
      expect(include.attachments.select).not.toHaveProperty('s3Key');
      expect(include.attachments.select).not.toHaveProperty('s3Bucket');
    });
  });

  describe('dueDate', () => {
    beforeEach(() => {
      mockPrisma.task.findFirst.mockResolvedValue({ id: '1', projectId: 'p' });
      mockPrisma.task.update.mockResolvedValue({ id: '1' });
    });

    it('clears the due date when null is sent', async () => {
      await service.update('1', { dueDate: null });
      expect(mockPrisma.task.update.mock.calls[0][0].data.dueDate).toBeNull();
    });

    it('leaves the due date untouched when omitted', async () => {
      await service.update('1', { title: 'New' });
      expect(
        mockPrisma.task.update.mock.calls[0][0].data.dueDate,
      ).toBeUndefined();
    });

    it('stores a parsed Date when a string is sent', async () => {
      await service.update('1', { dueDate: '2026-10-31T17:00:00Z' });
      expect(mockPrisma.task.update.mock.calls[0][0].data.dueDate).toEqual(
        new Date('2026-10-31T17:00:00Z'),
      );
    });

    it('answers 400, not 500, for dates the validator accepts but Date cannot parse', async () => {
      await expect(
        service.update('1', { dueDate: '2009-W53-7' } as any),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create('p', { title: 'T', dueDate: '2009-123' } as any, 'u'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll filters', () => {
    beforeEach(() => {
      mockPrisma.task.count.mockResolvedValue(0);
      mockPrisma.task.findMany.mockResolvedValue([]);
    });

    const whereOf = () => mockPrisma.task.findMany.mock.calls[0][0].where;

    it('treats a date-only dueBefore as inclusive of that whole day', async () => {
      await service.findAll('p', { dueBefore: '2026-10-31' }, {});
      expect(whereOf().dueDate.lte).toEqual(
        new Date('2026-10-31T23:59:59.999Z'),
      );
    });

    it('uses an exact instant when dueBefore has a time', async () => {
      await service.findAll('p', { dueBefore: '2026-10-31T10:00:00Z' }, {});
      expect(whereOf().dueDate.lte).toEqual(new Date('2026-10-31T10:00:00Z'));
    });

    it('applies dueAfter as an inclusive lower bound', async () => {
      await service.findAll('p', { dueAfter: '2026-10-01T00:00:00Z' }, {});
      expect(whereOf().dueDate.gte).toEqual(new Date('2026-10-01T00:00:00Z'));
    });

    it('orders newest first with an id tiebreaker so pages are stable', async () => {
      await service.findAll('p', {}, {});
      expect(mockPrisma.task.findMany.mock.calls[0][0].orderBy).toEqual([
        { createdAt: 'desc' },
        { id: 'desc' },
      ]);
    });

    it('rejects unparseable filter dates with 400', async () => {
      await expect(
        service.findAll('p', { dueAfter: '2009-W53-7' }, {}),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
