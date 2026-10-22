import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AttachmentsService } from './attachments.service';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { AuthorizationService } from '../common/authorization/authorization.service';
import { ATTACHMENT_PUBLIC_SELECT } from './attachments.constants';

const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(32),
]);
const PDF = Buffer.from('%PDF-1.7\n...');

const file = (over: Partial<Express.Multer.File> = {}) =>
  ({
    originalname: 'test.jpg',
    mimetype: 'image/jpeg',
    size: 1024,
    buffer: JPEG,
    ...over,
  }) as Express.Multer.File;

describe('AttachmentsService', () => {
  let service: AttachmentsService;

  const prisma: any = {
    task: { findFirst: jest.fn() },
    comment: { findFirst: jest.fn() },
    user: { findUnique: jest.fn(), update: jest.fn() },
    attachment: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const s3 = {
    uploadFile: jest.fn(),
    getPresignedUrl: jest.fn(),
    deleteObject: jest.fn(),
  };
  const authz = {
    assertCommentAuthorOrAdmin: jest.fn(),
    assertAttachmentAccess: jest.fn(),
    assertAttachmentManage: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: S3Service, useValue: s3 },
        { provide: AuthorizationService, useValue: authz },
      ],
    }).compile();

    service = module.get(AttachmentsService);
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((cb: any) => cb(prisma));
    s3.uploadFile.mockResolvedValue({ key: 'k', bucket: 'b' });
  });

  describe('uploadForTask', () => {
    beforeEach(() => prisma.task.findFirst.mockResolvedValue({ id: 'task1' }));

    it('uploads, records, and returns only public columns', async () => {
      prisma.attachment.create.mockResolvedValue({ id: 'att1' });

      const result = await service.uploadForTask('task1', file(), 'u1');

      expect(result).toEqual({ id: 'att1' });
      expect(s3.uploadFile).toHaveBeenCalledWith(
        JPEG,
        'image/jpeg',
        'tasks/task1',
      );
      const args = prisma.attachment.create.mock.calls[0][0];
      expect(args.select).toBe(ATTACHMENT_PUBLIC_SELECT);
      expect(args.select).not.toHaveProperty('s3Key');
      expect(args.data).toMatchObject({
        s3Key: 'k',
        s3Bucket: 'b',
        taskId: 'task1',
        uploadedById: 'u1',
        type: 'IMAGE',
      });
    });

    it('removes the uploaded object when recording it fails (no orphan in S3)', async () => {
      prisma.attachment.create.mockRejectedValue(new Error('db down'));

      await expect(
        service.uploadForTask('task1', file(), 'u1'),
      ).rejects.toThrow('db down');

      expect(s3.deleteObject).toHaveBeenCalledWith('b', 'k');
    });

    it('404s for a missing task before uploading anything', async () => {
      prisma.task.findFirst.mockResolvedValue(null);
      await expect(service.uploadForTask('x', file(), 'u1')).rejects.toThrow(
        NotFoundException,
      );
      expect(s3.uploadFile).not.toHaveBeenCalled();
    });

    it('sanitises the stored file name', async () => {
      prisma.attachment.create.mockResolvedValue({ id: 'a' });
      await service.uploadForTask(
        'task1',
        file({ originalname: '../../etc/pa\u0000sswd.jpg' }),
        'u1',
      );
      expect(prisma.attachment.create.mock.calls[0][0].data.fileName).toBe(
        '.._.._etc_passwd.jpg',
      );
    });
  });

  describe('upload validation', () => {
    it.each([
      ['no file', undefined, /No file/],
      ['empty file', file({ size: 0 }), /empty/],
      ['too large', file({ size: 10 * 1024 * 1024 + 1 }), /maximum size/],
      [
        'disallowed type',
        file({ mimetype: 'application/x-msdownload' }),
        /not allowed/,
      ],
    ])('rejects %s', async (_label, f, message) => {
      await expect(service.uploadForTask('t', f as any, 'u1')).rejects.toThrow(
        message,
      );
      expect(s3.uploadFile).not.toHaveBeenCalled();
    });

    it('rejects content that does not match the declared type (e.g. HTML sent as image/jpeg)', async () => {
      const spoofed = file({
        buffer: Buffer.from('<html><script>alert(1)</script></html>'),
      });
      await expect(service.uploadForTask('t', spoofed, 'u1')).rejects.toThrow(
        'File content does not match its declared type',
      );
      expect(s3.uploadFile).not.toHaveBeenCalled();
    });

    it('rejects binary content declared as text/plain', async () => {
      const f = file({ mimetype: 'text/plain', buffer: JPEG });
      await expect(service.uploadForTask('t', f, 'u1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('accepts a real PDF', async () => {
      prisma.task.findFirst.mockResolvedValue({ id: 't' });
      prisma.attachment.create.mockResolvedValue({ id: 'a' });
      const f = file({
        mimetype: 'application/pdf',
        buffer: PDF,
        originalname: 'r.pdf',
      });
      await expect(service.uploadForTask('t', f, 'u1')).resolves.toEqual({
        id: 'a',
      });
    });
  });

  describe('uploadForComment', () => {
    it('requires comment author or project admin', async () => {
      const comment = {
        id: 'c1',
        authorId: 'author',
        task: { projectId: 'p1' },
      };
      prisma.comment.findFirst.mockResolvedValue(comment);
      authz.assertCommentAuthorOrAdmin.mockRejectedValue(
        new Error('forbidden'),
      );

      await expect(
        service.uploadForComment('c1', file(), 'someone-else'),
      ).rejects.toThrow('forbidden');

      expect(authz.assertCommentAuthorOrAdmin).toHaveBeenCalledWith(
        'someone-else',
        comment,
      );
      expect(s3.uploadFile).not.toHaveBeenCalled();
    });

    it('uploads for the comment author', async () => {
      prisma.comment.findFirst.mockResolvedValue({
        id: 'c1',
        authorId: 'u1',
        task: { projectId: 'p1' },
      });
      authz.assertCommentAuthorOrAdmin.mockResolvedValue(undefined);
      prisma.attachment.create.mockResolvedValue({ id: 'a1' });

      await expect(
        service.uploadForComment('c1', file(), 'u1'),
      ).resolves.toEqual({ id: 'a1' });
    });
  });

  describe('uploadAvatar', () => {
    it('only accepts images', async () => {
      const f = file({ mimetype: 'application/pdf', buffer: PDF });
      await expect(service.uploadAvatar('u1', f)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('creates the row and repoints the user in one transaction, then removes the old avatar', async () => {
      prisma.user.findUnique.mockResolvedValue({ avatarId: 'old' });
      prisma.attachment.create.mockResolvedValue({ id: 'new' });
      prisma.attachment.findUnique.mockResolvedValue({
        id: 'old',
        s3Bucket: 'b',
        s3Key: 'old-k',
      });
      prisma.attachment.delete.mockResolvedValue({});

      const result = await service.uploadAvatar('u1', file());

      expect(result).toEqual({ id: 'new' });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { avatarId: 'new' },
      });
      expect(prisma.attachment.delete).toHaveBeenCalledWith({
        where: { id: 'old' },
      });
      expect(s3.deleteObject).toHaveBeenCalledWith('b', 'old-k');
    });

    it('discards the new object when the transaction fails and keeps the old avatar', async () => {
      prisma.user.findUnique.mockResolvedValue({ avatarId: 'old' });
      prisma.attachment.create.mockResolvedValue({ id: 'new' });
      prisma.user.update.mockRejectedValue(new Error('boom'));

      await expect(service.uploadAvatar('u1', file())).rejects.toThrow('boom');

      expect(s3.deleteObject).toHaveBeenCalledWith('b', 'k'); // the new upload
      expect(prisma.attachment.delete).not.toHaveBeenCalled(); // old avatar untouched
    });
  });

  describe('getDownloadUrl', () => {
    it('presigns with the original name, inline only for images', async () => {
      prisma.attachment.findUnique.mockResolvedValue({
        id: 'a',
        s3Bucket: 'b',
        s3Key: 'k',
        fileName: 'photo.png',
        mimeType: 'image/png',
        type: 'IMAGE',
      });
      s3.getPresignedUrl.mockResolvedValue('https://signed');

      const result = await service.getDownloadUrl('a');

      expect(s3.getPresignedUrl).toHaveBeenCalledWith('b', 'k', 3600, {
        fileName: 'photo.png',
        inline: true,
      });
      expect(result).toEqual({
        url: 'https://signed',
        fileName: 'photo.png',
        mimeType: 'image/png',
      });
    });

    it('forces download for non-images', async () => {
      prisma.attachment.findUnique.mockResolvedValue({
        id: 'a',
        s3Bucket: 'b',
        s3Key: 'k',
        fileName: 'r.pdf',
        mimeType: 'application/pdf',
        type: 'FILE',
      });
      s3.getPresignedUrl.mockResolvedValue('u');
      await service.getDownloadUrl('a');
      expect(s3.getPresignedUrl.mock.calls[0][3]).toEqual({
        fileName: 'r.pdf',
        inline: false,
      });
    });

    it('404s for an unknown attachment', async () => {
      prisma.attachment.findUnique.mockResolvedValue(null);
      await expect(service.getDownloadUrl('x')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('removeByUser', () => {
    it('checks access and the uploader/admin rule before deleting', async () => {
      const access = { id: 'a1', uploadedById: 'u9', projectId: 'p1' };
      authz.assertAttachmentAccess.mockResolvedValue(access);
      authz.assertAttachmentManage.mockResolvedValue(undefined);
      prisma.attachment.findUnique.mockResolvedValue({
        id: 'a1',
        s3Bucket: 'b',
        s3Key: 'k',
      });
      prisma.attachment.delete.mockResolvedValue({});

      await service.removeByUser('a1', 'u1');

      expect(authz.assertAttachmentManage).toHaveBeenCalledWith('u1', access);
      expect(prisma.attachment.delete).toHaveBeenCalled();
    });

    it('deletes nothing when the user may not manage the attachment', async () => {
      authz.assertAttachmentAccess.mockResolvedValue({ id: 'a1' });
      authz.assertAttachmentManage.mockRejectedValue(new Error('forbidden'));

      await expect(service.removeByUser('a1', 'u1')).rejects.toThrow(
        'forbidden',
      );
      expect(prisma.attachment.delete).not.toHaveBeenCalled();
      expect(s3.deleteObject).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes the row first, so a failing S3 call cannot leave a dangling row', async () => {
      const order: string[] = [];
      prisma.attachment.findUnique.mockResolvedValue({
        id: 'a',
        s3Bucket: 'b',
        s3Key: 'k',
      });
      prisma.attachment.delete.mockImplementation(async () => order.push('db'));
      s3.deleteObject.mockImplementation(async () => {
        order.push('s3');
        throw new Error('s3 down');
      });

      await expect(service.remove('a')).resolves.toBeDefined(); // S3 failure is only logged
      expect(order).toEqual(['db', 's3']);
    });

    it('returns only public columns', async () => {
      prisma.attachment.findUnique.mockResolvedValue({
        id: 'a',
        fileName: 'f',
        mimeType: 'm',
        sizeBytes: 1,
        type: 'FILE',
        uploadedById: 'u',
        taskId: 't',
        commentId: null,
        createdAt: new Date(0),
        s3Bucket: 'b',
        s3Key: 'k',
      });
      prisma.attachment.delete.mockResolvedValue({});

      const result = await service.remove('a');
      expect(result).not.toHaveProperty('s3Key');
      expect(result).not.toHaveProperty('s3Bucket');
    });
  });

  describe('detachFor / purgeObjects (transactional cascade helpers)', () => {
    it('deletes rows inside the caller transaction and returns the files to purge', async () => {
      const found = [
        { id: 'a1', s3Bucket: 'b', s3Key: 'k1' },
        { id: 'a2', s3Bucket: 'b', s3Key: 'k2' },
      ];
      prisma.attachment.findMany.mockResolvedValue(found);

      const stored = await service.detachFor(prisma, {
        taskIds: ['t1'],
        commentIds: ['c1'],
      });

      expect(prisma.attachment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [{ taskId: { in: ['t1'] } }, { commentId: { in: ['c1'] } }],
          },
        }),
      );
      expect(prisma.attachment.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['a1', 'a2'] } },
      });
      expect(stored).toBe(found);
      expect(s3.deleteObject).not.toHaveBeenCalled(); // purging is the caller's job, after commit
    });

    it('does nothing for empty scopes', async () => {
      expect(
        await service.detachFor(prisma, { taskIds: [], commentIds: [] }),
      ).toEqual([]);
      expect(prisma.attachment.findMany).not.toHaveBeenCalled();
    });

    it('purgeObjects is best-effort', async () => {
      s3.deleteObject
        .mockRejectedValueOnce(new Error('x'))
        .mockResolvedValueOnce(undefined);

      await expect(
        service.purgeObjects([
          { s3Bucket: 'b', s3Key: 'k1' },
          { s3Bucket: 'b', s3Key: 'k2' },
        ]),
      ).resolves.toBeUndefined();
      expect(s3.deleteObject).toHaveBeenCalledTimes(2);
    });
  });

  describe('findAllForTask', () => {
    it('selects public columns in a stable order', async () => {
      prisma.attachment.findMany.mockResolvedValue([]);
      await service.findAllForTask('t1');
      expect(prisma.attachment.findMany).toHaveBeenCalledWith({
        where: { taskId: 't1' },
        select: ATTACHMENT_PUBLIC_SELECT,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
    });
  });
});
