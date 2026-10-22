import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { ForbiddenException } from '@nestjs/common';

describe('UsersController', () => {
  let controller: UsersController;
  let service: UsersService;

  const mockUserResponse = {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
    avatarId: null,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: {
            findOne: jest.fn(),
            update: jest.fn(),
            getMe: jest.fn(),
            softDelete: jest.fn(),
            changePassword: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('me', () => {
    it('getMe uses the authenticated user id', async () => {
      jest.spyOn(service, 'getMe').mockResolvedValue(mockUserResponse);
      await expect(controller.getMe('user-1')).resolves.toEqual(
        mockUserResponse,
      );
      expect(service.getMe).toHaveBeenCalledWith('user-1');
    });

    it('updateMe updates the authenticated user', async () => {
      jest.spyOn(service, 'update').mockResolvedValue(mockUserResponse);
      await controller.updateMe('user-1', { name: 'New' });
      expect(service.update).toHaveBeenCalledWith('user-1', { name: 'New' });
    });

    it('deleteMe deletes the authenticated user', async () => {
      jest.spyOn(service, 'softDelete').mockResolvedValue(mockUserResponse);
      await controller.deleteMe('user-1');
      expect(service.softDelete).toHaveBeenCalledWith('user-1');
    });

    it('changePassword answers 204 and delegates', async () => {
      const dto = { currentPassword: 'old1', newPassword: 'new-pass-1' };
      await controller.changePassword('user-1', dto);
      expect(service.changePassword).toHaveBeenCalledWith('user-1', dto);
      expect(
        Reflect.getMetadata(
          '__httpCode__',
          UsersController.prototype.changePassword,
        ),
      ).toBe(204);
    });
  });

  describe('deprecated /:id routes (self only)', () => {
    it('allows self access', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(mockUserResponse);
      await expect(controller.findOne('user-1', 'user-1')).resolves.toEqual(
        mockUserResponse,
      );
    });

    it('forbids access to other users', () => {
      expect(() => controller.findOne('user-2', 'user-1')).toThrow(
        ForbiddenException,
      );
      expect(() => controller.update('user-2', {}, 'user-1')).toThrow(
        ForbiddenException,
      );
      expect(() => controller.softDelete('user-2', 'user-1')).toThrow(
        ForbiddenException,
      );
      expect(service.findOne).not.toHaveBeenCalled();
    });

    it('allows self update and delete', async () => {
      jest.spyOn(service, 'update').mockResolvedValue(mockUserResponse);
      jest.spyOn(service, 'softDelete').mockResolvedValue(mockUserResponse);
      await controller.update('user-1', { name: 'X' }, 'user-1');
      await controller.softDelete('user-1', 'user-1');
      expect(service.update).toHaveBeenCalledWith('user-1', { name: 'X' });
      expect(service.softDelete).toHaveBeenCalledWith('user-1');
    });
  });
});
