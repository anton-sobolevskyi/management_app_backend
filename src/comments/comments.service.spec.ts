import { Test, TestingModule } from '@nestjs/testing';
import { CommentsService } from './comments.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from '../common/authorization/authorization.service';
import { AttachmentsService } from '../attachments/attachments.service';

describe('CommentsService', () => {
  let service: CommentsService;

  const mockPrisma: any = {
    comment: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockAuthz = {
    assertCommentAccess: jest.fn(),
    assertCommentAuthorOrAdmin: jest.fn(),
  };

  const mockAttachments = {
    detachFor: jest.fn(),
    purgeObjects: jest.fn(),
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
    mockPrisma.$transaction.mockImplementation((cb: any) => cb(mockPrisma));
  });

  it('should create a comment', async () => {
    const dto = { content: 'Test comment' };
    const mockComment = { id: '1', ...dto, taskId: 't1', authorId: 'u1' };
    mockPrisma.comment.create.mockResolvedValue(mockComment);

    const result = await service.create('t1', dto, 'u1');

    expect(result).toEqual(mockComment);
    expect(mockPrisma.comment.create).toHaveBeenCalledWith({
      data: { content: dto.content, taskId: 't1', authorId: 'u1' },
    });
  });

  it('lists comments oldest first with a stable tiebreaker', async () => {
    mockPrisma.comment.count.mockResolvedValue(0);
    mockPrisma.comment.findMany.mockResolvedValue([]);

    await service.findAll('t1');

    expect(mockPrisma.comment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('never exposes storage keys on a single comment', async () => {
    mockPrisma.comment.findFirst.mockResolvedValue({
      id: 'c1',
      attachments: [],
    });

    await service.findOne('c1');

    const { include } = mockPrisma.comment.findFirst.mock.calls[0][0];
    expect(include.attachments.select).toBeDefined();
    expect(include.attachments.select).not.toHaveProperty('s3Key');
    expect(include.attachments.select).not.toHaveProperty('s3Bucket');
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

    const result = await service.update('c1', dto, 'u1');

    expect(mockAuthz.assertCommentAccess).toHaveBeenCalledWith('u1', 'c1');
    expect(mockAuthz.assertCommentAuthorOrAdmin).toHaveBeenCalledWith(
      'u1',
      comment,
    );
    expect(result).toEqual({ id: 'c1', ...dto });
  });

  describe('softDelete', () => {
    const comment = { id: 'c1', authorId: 'u1', task: { projectId: 'p1' } };

    beforeEach(() => {
      mockAuthz.assertCommentAccess.mockResolvedValue(comment);
      mockAuthz.assertCommentAuthorOrAdmin.mockResolvedValue(undefined);
    });

    it('detaches attachment rows in the transaction and purges files after commit', async () => {
      const stored = [{ s3Bucket: 'b', s3Key: 'k' }];
      const order: string[] = [];
      mockAttachments.detachFor.mockImplementation(async () => {
        order.push('detach');
        return stored;
      });
      mockPrisma.comment.update.mockImplementation(async () => {
        order.push('update');
        return { id: 'c1', deletedAt: new Date() };
      });
      mockPrisma.$transaction.mockImplementation(async (cb: any) => {
        const result = await cb(mockPrisma);
        order.push('commit');
        return result;
      });
      mockAttachments.purgeObjects.mockImplementation(async () => {
        order.push('purge');
      });

      await service.softDelete('c1', 'u1');

      expect(mockAttachments.detachFor).toHaveBeenCalledWith(mockPrisma, {
        commentIds: ['c1'],
      });
      expect(mockAttachments.purgeObjects).toHaveBeenCalledWith(stored);
      expect(order).toEqual(['detach', 'update', 'commit', 'purge']);
    });

    it('leaves the files alone when the transaction fails', async () => {
      mockAttachments.detachFor.mockResolvedValue([
        { s3Bucket: 'b', s3Key: 'k' },
      ]);
      mockPrisma.comment.update.mockRejectedValue(new Error('db down'));

      await expect(service.softDelete('c1', 'u1')).rejects.toThrow('db down');

      expect(mockAttachments.purgeObjects).not.toHaveBeenCalled();
    });
  });
});
