import { Test, TestingModule } from '@nestjs/testing';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { ProjectMemberGuard } from '../common/authorization/project-member.guard';

describe('TasksController', () => {
  let controller: TasksController;
  let service: TasksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [{ provide: TasksService, useValue: { findOne: jest.fn() } }],
    })
      .overrideGuard(ProjectMemberGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TasksController>(TasksController);
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
