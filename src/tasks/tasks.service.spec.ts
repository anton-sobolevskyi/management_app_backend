import { Test, TestingModule } from '@nestjs/testing';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('TasksService', () => {
  let service: TasksService;
  let prisma: PrismaService;

  const mockPrisma = {
    task: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    comment: {
      updateMany: jest.fn(),
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
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should create a task', async () => {
    const dto = { title: 'Test Task', description: 'Desc' } as any;
    const mockTask = { id: '1', ...dto };
    mockPrisma.task.create.mockResolvedValue(mockTask);

    const result = await service.create('proj-1', dto, 'user-1');
    expect(result).toEqual(mockTask);
    expect(mockPrisma.task.create).toHaveBeenCalled();
  });

  it('should throw NotFoundException if task not found', async () => {
    mockPrisma.task.findFirst.mockResolvedValue(null);
    await expect(service.findOne('invalid-id')).rejects.toThrow(NotFoundException);
  });

  it('should update a task', async () => {
    const dto = { title: 'Updated Title' };
    const mockTask = { id: '1', title: 'Updated Title' };
    
    // Mock findOne (findFirst) to succeed
    mockPrisma.task.findFirst.mockResolvedValue({ id: '1' });
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
    mockPrisma.task.update.mockResolvedValue({ id: '1', deletedAt: new Date() });

    await service.softDelete('1');

    expect(mockPrisma.comment.updateMany).toHaveBeenCalledWith({
      where: { taskId: '1', deletedAt: null },
      data: expect.any(Object),
    });
    expect(mockPrisma.task.update).toHaveBeenCalled();
  });
});
