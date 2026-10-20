import { Test, TestingModule } from '@nestjs/testing';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
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
      updateMany: jest.fn(),
    },
    projectMember: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: mockPrisma },
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
    expect(mockPrisma.task.create).toHaveBeenCalled();
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

  it('should update a task', async () => {
    const dto = { title: 'Updated Title' };
    const mockTask = { id: '1', title: 'Updated Title' };

    mockPrisma.task.findFirst.mockResolvedValue({
      id: '1',
      projectId: 'proj-1',
    });
    mockPrisma.task.update.mockResolvedValue(mockTask);

    const result = await service.update('1', dto);

    expect(result).toEqual(mockTask);
    expect(mockPrisma.task.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: expect.objectContaining(dto),
    });
  });

  it('should soft delete a task and its comments', async () => {
    mockPrisma.task.findFirst.mockResolvedValue({ id: '1' });
    mockPrisma.comment.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.task.update.mockResolvedValue({
      id: '1',
      deletedAt: new Date(),
    });

    await service.softDelete('1');

    expect(mockPrisma.comment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ taskId: '1' }),
      }),
    );
    expect(mockPrisma.task.update).toHaveBeenCalled();
  });
});
