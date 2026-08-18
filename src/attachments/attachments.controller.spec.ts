import { Test, TestingModule } from '@nestjs/testing';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { UnauthorizedException } from '@nestjs/common';

describe('AttachmentsController', () => {
  let controller: AttachmentsController;
  let service: AttachmentsService;

  const mockRequest = { user: { userId: 'user123' } } as any;
  const mockFile = { originalname: 'test.jpg' } as Express.Multer.File;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AttachmentsController],
      providers: [
        {
          provide: AttachmentsService,
          useValue: {
            uploadForTask: jest.fn(),
            uploadForComment: jest.fn(),
            uploadAvatar: jest.fn(),
            findAllForTask: jest.fn(),
            getDownloadUrl: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AttachmentsController>(AttachmentsController);
    service = module.get<AttachmentsService>(AttachmentsService);
  });

  describe('uploadForTask', () => {
    it('should call service.uploadForTask', async () => {
      jest.spyOn(service, 'uploadForTask').mockResolvedValue({ id: 'att1' } as any);
      const result = await controller.uploadForTask('task1', mockFile, mockRequest);
      expect(result.id).toBe('att1');
      expect(service.uploadForTask).toHaveBeenCalledWith('task1', mockFile, 'user123');
    });

    // If your controller does not explicitly throw UnauthorizedException, 
    // this test will fail. If you want to test that it handles missing users, 
    // ensure your controller has that logic. Otherwise, remove this test.
    it('should throw UnauthorizedException if no user', async () => {
      // We mock a request without a user object
      const reqWithoutUser = { user: null } as any;
      // If your controller logic is: if (!req.user) throw new UnauthorizedException();
      // Then this test will pass.
      await expect(controller.uploadForTask('task1', mockFile, reqWithoutUser)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('uploadForComment', () => {
    it('should call service.uploadForComment', async () => {
      jest.spyOn(service, 'uploadForComment').mockResolvedValue({ id: 'att1' } as any);
      const result = await controller.uploadForComment('comm1', mockFile, mockRequest);
      expect(result.id).toBe('att1');
      expect(service.uploadForComment).toHaveBeenCalledWith('comm1', mockFile, 'user123');
    });
  });

  describe('uploadAvatar', () => {
    it('should call service.uploadAvatar', async () => {
      jest.spyOn(service, 'uploadAvatar').mockResolvedValue({ id: 'att1' } as any);
      const result = await controller.uploadAvatar(mockFile, mockRequest);
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
      jest.spyOn(service, 'getDownloadUrl').mockResolvedValue({ url: 'http://url', fileName: 'test.jpg', mimeType: 'image/jpeg' } as any);
      await controller.getDownloadUrl('att1');
      expect(service.getDownloadUrl).toHaveBeenCalledWith('att1');
    });
  });

  describe('remove', () => {
    it('should call service.remove', async () => {
      jest.spyOn(service, 'remove').mockResolvedValue({ id: 'att1' } as any);
      await controller.remove('att1');
      expect(service.remove).toHaveBeenCalledWith('att1');
    });
  });
});
