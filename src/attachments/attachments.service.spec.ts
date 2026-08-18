import { Test, TestingModule } from '@nestjs/testing';
import { AttachmentsService } from './attachments.service';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AttachmentType } from '../generated/prisma/enums';

describe('AttachmentsService', () => {
  let service: AttachmentsService;
  let prisma: PrismaService;
  let s3: S3Service;

  const mockFile = {
    originalname: 'test.jpg',
    mimetype: 'image/jpeg',
    size: 1024,
    buffer: Buffer.from('test'),
  } as Express.Multer.File;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentsService,
        {
          provide: PrismaService,
          useValue: {
            task: { findFirst: jest.fn() },
            comment: { findFirst: jest.fn() },
            user: { findUnique: jest.fn(), update: jest.fn() },
            attachment: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
              delete: jest.fn(),
            },
          },
        },
        {
          provide: S3Service,
          useValue: {
            uploadFile: jest.fn(),
            getPresignedUrl: jest.fn(),
            deleteObject: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AttachmentsService>(AttachmentsService);
    prisma = module.get<PrismaService>(PrismaService);
    s3 = module.get<S3Service>(S3Service);
  });

  describe('uploadForTask', () => {
    it('should upload file and create attachment record', async () => {
      jest.spyOn(prisma.task, 'findFirst').mockResolvedValue({ id: 'task1' } as any);
      jest.spyOn(s3, 'uploadFile').mockResolvedValue({ key: 'key', bucket: 'bucket' });
      jest.spyOn(prisma.attachment, 'create').mockResolvedValue({ id: 'att1' } as any);

      const result = await service.uploadForTask('task1', mockFile, 'user1');
      expect(result.id).toBe('att1');
    });

    it('should throw NotFoundException if task does not exist', async () => {
      jest.spyOn(prisma.task, 'findFirst').mockResolvedValue(null);
      await expect(service.uploadForTask('task1', mockFile, 'user1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('uploadForComment', () => {
    it('should upload file and create attachment record', async () => {
      jest.spyOn(prisma.comment, 'findFirst').mockResolvedValue({ id: 'comm1' } as any);
      jest.spyOn(s3, 'uploadFile').mockResolvedValue({ key: 'key', bucket: 'bucket' });
      jest.spyOn(prisma.attachment, 'create').mockResolvedValue({ id: 'att1' } as any);

      const result = await service.uploadForComment('comm1', mockFile, 'user1');
      expect(result.id).toBe('att1');
    });

    it('should throw NotFoundException if comment does not exist', async () => {
      jest.spyOn(prisma.comment, 'findFirst').mockResolvedValue(null);
      await expect(service.uploadForComment('comm1', mockFile, 'user1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('uploadAvatar', () => {
    it('should upload avatar and update user', async () => {
      const attachment = { id: 'att1' };
      jest.spyOn(s3, 'uploadFile').mockResolvedValue({ key: 'key', bucket: 'bucket' });
      jest.spyOn(prisma.attachment, 'create').mockResolvedValue(attachment as any);
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({ avatarId: 'oldAtt' } as any);
      jest.spyOn(prisma.user, 'update').mockResolvedValue({} as any);
      jest.spyOn(service, 'remove').mockResolvedValue({} as any);

      const result = await service.uploadAvatar('user1', mockFile);
      expect(result).toEqual(attachment);
      expect(prisma.user.update).toHaveBeenCalled();
      expect(service.remove).toHaveBeenCalledWith('oldAtt');
    });
  });

  describe('findOne', () => {
    it('should return attachment if found', async () => {
      jest.spyOn(prisma.attachment, 'findUnique').mockResolvedValue({ id: 'att1' } as any);
      const result = await service.findOne('att1');
      expect(result.id).toBe('att1');
    });

    it('should throw NotFoundException if not found', async () => {
      jest.spyOn(prisma.attachment, 'findUnique').mockResolvedValue(null);
      await expect(service.findOne('att1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getDownloadUrl', () => {
    it('should return presigned url', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue({ s3Key: 'key', s3Bucket: 'bucket', fileName: 'test.jpg', mimeType: 'image/jpeg' } as any);
      jest.spyOn(s3, 'getPresignedUrl').mockResolvedValue('http://url');

      const result = await service.getDownloadUrl('att1');
      expect(result.url).toBe('http://url');
    });
  });

  describe('remove', () => {
    it('should delete from s3 and database', async () => {
      jest.spyOn(prisma.attachment, 'findUnique').mockResolvedValue({ s3Key: 'key', s3Bucket: 'bucket' } as any);
      jest.spyOn(s3, 'deleteObject').mockResolvedValue(undefined);
      jest.spyOn(prisma.attachment, 'delete').mockResolvedValue({ id: 'att1' } as any);

      const result = await service.remove('att1');
      expect(result.id).toBe('att1');
      expect(s3.deleteObject).toHaveBeenCalled();
    });
  });
});
