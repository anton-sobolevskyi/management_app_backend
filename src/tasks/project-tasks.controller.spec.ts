import { Test, TestingModule } from '@nestjs/testing';
import { ProjectTasksController } from './project-tasks.controller';
import { TasksService } from './tasks.service';
import { ProjectMemberGuard } from '../common/authorization/project-member.guard';

describe('ProjectTasksController', () => {
  let controller: ProjectTasksController;
  let service: TasksService;

  const mockTasksService = {
    create: jest.fn(),
    findAll: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectTasksController],
      providers: [{ provide: TasksService, useValue: mockTasksService }],
    })
      .overrideGuard(ProjectMemberGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ProjectTasksController>(ProjectTasksController);
    service = module.get<TasksService>(TasksService);
  });

  it('should call service.create with correct params', async () => {
    const dto = { title: 'New Task' } as any;

    await controller.create('proj-1', dto, 'user-1');

    expect(service.create).toHaveBeenCalledWith('proj-1', dto, 'user-1');
  });

  it('should split filters from pagination for findAll', async () => {
    await controller.findAll('proj-1', {
      page: 2,
      limit: 5,
      status: 'TODO',
      q: 'bug',
      dueBefore: '2026-10-31',
    } as any);

    expect(service.findAll).toHaveBeenCalledWith(
      'proj-1',
      {
        status: 'TODO',
        assignedToId: undefined,
        q: 'bug',
        dueBefore: '2026-10-31',
        dueAfter: undefined,
      },
      { page: 2, limit: 5 },
    );
  });
});
