import { Test, TestingModule } from '@nestjs/testing';
import { TaskController } from './task.controller';
import { TasksService } from './tasks.service';

describe('TaskController', () => {
  let controller: TaskController;
  let service: TasksService;

  const mockTasksService = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TaskController],
      providers: [{ provide: TasksService, useValue: mockTasksService }],
    }).compile();

    controller = module.get<TaskController>(TaskController);
    service = module.get<TasksService>(TasksService);
  });

  it('should call service.findOne', async () => {
    const mockTask = { id: 'task-1', title: 'Task' };
    mockTasksService.findOne.mockResolvedValue(mockTask);

    const result = await controller.findOne('task-1');
    
    expect(service.findOne).toHaveBeenCalledWith('task-1');
    expect(result).toEqual(mockTask);
  });
});
