import { Test, TestingModule } from '@nestjs/testing';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TasksService', () => {
  let service: TasksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { 
          provide: PrismaService, 
          useValue: { 
            task: { 
              create: jest.fn(), 
              findMany: jest.fn(), 
              findFirst: jest.fn(), 
              update: jest.fn() 
            }, 
            comment: { 
              updateMany: jest.fn() 
            } 
          } 
        }
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
