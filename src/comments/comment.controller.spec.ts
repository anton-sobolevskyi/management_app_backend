import { Test, TestingModule } from '@nestjs/testing';
import { CommentController } from './comment.controller';
import { CommentsService } from './comments.service';
import { ProjectMemberGuard } from '../common/authorization/project-member.guard';

describe('CommentController', () => {
  let controller: CommentController;
  let service: CommentsService;

  const mockCommentsService = {
    findOne: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommentController],
      providers: [{ provide: CommentsService, useValue: mockCommentsService }],
    })
      .overrideGuard(ProjectMemberGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CommentController>(CommentController);
    service = module.get<CommentsService>(CommentsService);
  });

  it('should call service.findOne', async () => {
    const mockComment = { id: 'c1', content: 'Hey' };
    mockCommentsService.findOne.mockResolvedValue(mockComment);

    const result = await controller.findOne('c1');

    expect(service.findOne).toHaveBeenCalledWith('c1');
    expect(result).toEqual(mockComment);
  });

  it('should call service.update with userId', async () => {
    const dto = { content: 'Updated' };
    mockCommentsService.update.mockResolvedValue({ id: 'c1', ...dto });

    await controller.update('c1', dto, 'user-1');

    expect(service.update).toHaveBeenCalledWith('c1', dto, 'user-1');
  });

  it('should call service.softDelete with userId', async () => {
    mockCommentsService.softDelete.mockResolvedValue({ id: 'c1' });

    await controller.softDelete('c1', 'user-1');

    expect(service.softDelete).toHaveBeenCalledWith('c1', 'user-1');
  });
});
