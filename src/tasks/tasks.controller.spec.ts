import { Test, TestingModule } from '@nestjs/testing';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

describe('TasksController', () => {
  let controller: TasksController;
  let service: TasksService;

  const mockTasksService = {
    create: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [{ provide: TasksService, useValue: mockTasksService }],
    }).compile();

    controller = module.get<TasksController>(TasksController);
    service = module.get<TasksService>(TasksService);
  });

  it('should call service.create with correct params', async () => {
    const dto = { title: 'New Task' } as any;
    const req = { user: { id: 'user-1' } } as any;
    
    await controller.create('proj-1', dto, req);
    
    expect(service.create).toHaveBeenCalledWith('proj-1', dto, 'user-1');
  });
});
