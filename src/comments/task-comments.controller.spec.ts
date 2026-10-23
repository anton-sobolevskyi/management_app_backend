import { Test, TestingModule } from '@nestjs/testing';
import { TaskCommentsController } from './task-comments.controller';
import { CommentsService } from './comments.service';
import { ProjectMemberGuard } from '../common/authorization/project-member.guard';

describe('TaskCommentsController', () => {
  let controller: TaskCommentsController;
  let service: CommentsService;

  const mockCommentsService = {
    create: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TaskCommentsController],
      providers: [{ provide: CommentsService, useValue: mockCommentsService }],
    })
      .overrideGuard(ProjectMemberGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TaskCommentsController>(TaskCommentsController);
    service = module.get<CommentsService>(CommentsService);
  });

  it('should call service.create with correct params', async () => {
    const dto = { content: 'New comment' };

    await controller.create('task-1', dto, 'user-1');

    expect(service.create).toHaveBeenCalledWith('task-1', dto, 'user-1');
  });
});
