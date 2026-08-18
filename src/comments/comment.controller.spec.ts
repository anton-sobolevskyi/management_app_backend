import { Test, TestingModule } from '@nestjs/testing';
import { CommentController } from './comment.controller';
import { CommentsService } from './comments.service';

describe('CommentController', () => {
  let controller: CommentController;
  let service: CommentsService;

  const mockCommentsService = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommentController],
      providers: [{ provide: CommentsService, useValue: mockCommentsService }],
    }).compile();

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
});
