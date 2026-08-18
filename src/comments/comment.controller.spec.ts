import { Test, TestingModule } from '@nestjs/testing';
import { CommentController } from './comment.controller';
import { CommentsService } from './comments.service';

describe('CommentController', () => {
  let controller: CommentController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommentController],
      providers: [
        { 
          provide: CommentsService, 
          useValue: { 
            findOne: jest.fn(), 
            update: jest.fn(), 
            softDelete: jest.fn() 
          } 
        }
      ]
    }).compile();

    controller = module.get<CommentController>(CommentController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
