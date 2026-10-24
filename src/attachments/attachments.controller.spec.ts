import { Test, TestingModule } from '@nestjs/testing';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { AppConfigService } from '../config/app-config.service';
import { SimpleThrottlerGuard } from '../common/throttler/simple-throttler.guard';
import { ProjectMemberGuard } from '../common/authorization/project-member.guard';

describe('AttachmentsController', () => {
  let controller: AttachmentsController;
  let service: AttachmentsService;

  const mockFile = { originalname: 'test.jpg' } as Express.Multer.File;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AttachmentsController],
      providers: [
        { provide: AppConfigService, useValue: new AppConfigService() },
        {
          provide: AttachmentsService,
          useValue: {
            uploadForTask: jest.fn(),
            uploadForComment: jest.fn(),
            uploadAvatar: jest.fn(),
            findAllForTask: jest.fn(),
            getDownloadUrl: jest.fn(),
            removeByUser: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(SimpleThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ProjectMemberGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AttachmentsController>(AttachmentsController);
    service = module.get<AttachmentsService>(AttachmentsService);
  });

  describe('uploadForTask', () => {
    it('should call service.uploadForTask', async () => {
      jest
        .spyOn(service, 'uploadForTask')
        .mockResolvedValue({ id: 'att1' } as any);
      const result = await controller.uploadForTask(
        'task1',
        mockFile,
        'user123',
      );
      expect(result.id).toBe('att1');
      expect(service.uploadForTask).toHaveBeenCalledWith(
        'task1',
        mockFile,
        'user123',
      );
    });
  });

  describe('uploadForComment', () => {
    it('should call service.uploadForComment', async () => {
      jest
        .spyOn(service, 'uploadForComment')
        .mockResolvedValue({ id: 'att1' } as any);
      const result = await controller.uploadForComment(
        'comm1',
        mockFile,
        'user123',
      );
      expect(result.id).toBe('att1');
      expect(service.uploadForComment).toHaveBeenCalledWith(
        'comm1',
        mockFile,
        'user123',
      );
    });
  });

  describe('uploadAvatar', () => {
    it('should call service.uploadAvatar', async () => {
      jest
        .spyOn(service, 'uploadAvatar')
        .mockResolvedValue({ id: 'att1' } as any);
      const result = await controller.uploadAvatar(mockFile, 'user123');
      expect(result.id).toBe('att1');
      expect(service.uploadAvatar).toHaveBeenCalledWith('user123', mockFile);
    });
  });

  describe('findAllForTask', () => {
    it('should call service.findAllForTask', async () => {
      jest.spyOn(service, 'findAllForTask').mockResolvedValue([]);
      await controller.findAllForTask('task1');
      expect(service.findAllForTask).toHaveBeenCalledWith('task1');
    });
  });

  describe('getDownloadUrl', () => {
    it('should call service.getDownloadUrl', async () => {
      jest.spyOn(service, 'getDownloadUrl').mockResolvedValue({
        url: 'http://url',
        fileName: 'test.jpg',
        mimeType: 'image/jpeg',
      });
      await controller.getDownloadUrl('att1');
      expect(service.getDownloadUrl).toHaveBeenCalledWith('att1');
    });
  });

  describe('remove', () => {
    it('deletes on behalf of the user (uploader/admin rule lives in the service)', async () => {
      jest
        .spyOn(service, 'removeByUser')
        .mockResolvedValue({ id: 'att1' } as any);
      await controller.remove('att1', 'user123');
      expect(service.removeByUser).toHaveBeenCalledWith('att1', 'user123');
    });
  });
});
