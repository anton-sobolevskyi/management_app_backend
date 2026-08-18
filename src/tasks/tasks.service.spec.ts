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
});
