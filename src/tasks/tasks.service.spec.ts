import { Test, TestingModule } from '@nestjs/testing';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('TasksService', () => {
  let service: TasksService;

  const mockPrisma = {
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
  };

  const mockAttachments = {
    removeForTasks: jest.fn(),
    removeForComments: jest.fn(),
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

  it('should soft delete a task, comments, and attachments', async () => {
    mockPrisma.task.findFirst.mockResolvedValue({ id: '1' });
    mockPrisma.comment.findMany.mockResolvedValue([{ id: 'c1' }]);
    mockPrisma.comment.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.task.update.mockResolvedValue({
      id: '1',
      deletedAt: new Date(),
    });

    await service.softDelete('1');

    expect(mockAttachments.removeForComments).toHaveBeenCalledWith(['c1']);
    expect(mockAttachments.removeForTasks).toHaveBeenCalledWith(['1']);
    expect(mockPrisma.comment.updateMany).toHaveBeenCalled();
  });
});
