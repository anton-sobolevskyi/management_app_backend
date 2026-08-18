import { Test, TestingModule } from '@nestjs/testing';
import { CommentsService } from './comments.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CommentsService', () => {
  let service: CommentsService;
  let prisma: PrismaService;

  const mockPrisma = {
    comment: {
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CommentsService>(CommentsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should create a comment', async () => {
    const dto = { content: 'Test comment' };
    const mockComment = { id: '1', ...dto, taskId: 't1', authorId: 'u1' };
    mockPrisma.comment.create.mockResolvedValue(mockComment);

    const result = await service.create('t1', dto as any, 'u1');
    
    expect(result).toEqual(mockComment);
    expect(mockPrisma.comment.create).toHaveBeenCalledWith({
      data: { content: dto.content, taskId: 't1', authorId: 'u1' }
    });
  });
});
