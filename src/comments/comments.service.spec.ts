import { Test, TestingModule } from '@nestjs/testing';
import { CommentsService } from './comments.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from '../common/authorization/authorization.service';
import { AttachmentsService } from '../attachments/attachments.service';

describe('CommentsService', () => {
  let service: CommentsService;

  const mockPrisma = {
    comment: {
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockAuthz = {
    assertCommentAccess: jest.fn(),
    assertCommentAuthorOrAdmin: jest.fn(),
  };

  const mockAttachments = {
    removeForComments: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuthorizationService, useValue: mockAuthz },
        { provide: AttachmentsService, useValue: mockAttachments },
      ],
    }).compile();

    service = module.get<CommentsService>(CommentsService);
    jest.clearAllMocks();
  });

  it('should create a comment', async () => {
    const dto = { content: 'Test comment' };
    const mockComment = { id: '1', ...dto, taskId: 't1', authorId: 'u1' };
    mockPrisma.comment.create.mockResolvedValue(mockComment);

    const result = await service.create('t1', dto as any, 'u1');

    expect(result).toEqual(mockComment);
    expect(mockPrisma.comment.create).toHaveBeenCalledWith({
      data: { content: dto.content, taskId: 't1', authorId: 'u1' },
    });
  });

  it('should update a comment after authz checks', async () => {
    const dto = { content: 'Updated' };
    const comment = {
      id: 'c1',
      authorId: 'u1',
      task: { projectId: 'p1' },
    };
    mockAuthz.assertCommentAccess.mockResolvedValue(comment);
    mockAuthz.assertCommentAuthorOrAdmin.mockResolvedValue(undefined);
    mockPrisma.comment.update.mockResolvedValue({ id: 'c1', ...dto });

    const result = await service.update('c1', dto as any, 'u1');

    expect(mockAuthz.assertCommentAccess).toHaveBeenCalledWith('u1', 'c1');
    expect(mockAuthz.assertCommentAuthorOrAdmin).toHaveBeenCalledWith(
      'u1',
      comment,
    );
    expect(result).toEqual({ id: 'c1', ...dto });
  });

  it('should soft delete and clean attachments', async () => {
    const comment = {
      id: 'c1',
      authorId: 'u1',
      task: { projectId: 'p1' },
    };
    mockAuthz.assertCommentAccess.mockResolvedValue(comment);
    mockAuthz.assertCommentAuthorOrAdmin.mockResolvedValue(undefined);
    mockPrisma.comment.update.mockResolvedValue({
      id: 'c1',
      deletedAt: new Date(),
    });

    await service.softDelete('c1', 'u1');

    expect(mockAttachments.removeForComments).toHaveBeenCalledWith(['c1']);
  });
});
