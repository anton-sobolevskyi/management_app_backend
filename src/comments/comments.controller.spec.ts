import { Test, TestingModule } from '@nestjs/testing';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';

describe('CommentsController', () => {
  let controller: CommentsController;
  let service: CommentsService;

  const mockCommentsService = {
    create: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommentsController],
      providers: [{ provide: CommentsService, useValue: mockCommentsService }],
    }).compile();

    controller = module.get<CommentsController>(CommentsController);
    service = module.get<CommentsService>(CommentsService);
  });

  it('should call service.create with correct params', async () => {
    const dto = { content: 'New comment' };
    const req = { user: { userId: 'user-1' } } as any;

    await controller.create('task-1', dto as any, req);

    expect(service.create).toHaveBeenCalledWith('task-1', dto, 'user-1');
  });
});
