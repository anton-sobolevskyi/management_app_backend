import { Test, TestingModule } from '@nestjs/testing';
import { TaskController } from './task.controller';
import { TasksService } from './tasks.service';
import { ProjectMemberGuard } from '../common/authorization/project-member.guard';

describe('TaskController', () => {
  let controller: TaskController;
  let service: TasksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TaskController],
      providers: [{ provide: TasksService, useValue: { findOne: jest.fn() } }],
    })
      .overrideGuard(ProjectMemberGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TaskController>(TaskController);
    service = module.get<TasksService>(TasksService);
  });

  it('should call service.findOne', async () => {
    const mockTask = { id: 'task-1', title: 'Task' };
    const spy = jest
      .spyOn(service, 'findOne')
      .mockResolvedValue(mockTask as any);

    const result = await controller.findOne('task-1');

    expect(spy).toHaveBeenCalledWith('task-1');
    expect(result).toEqual(mockTask);
  });
});
