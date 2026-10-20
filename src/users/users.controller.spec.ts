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

  describe('getMe', () => {
    it('should call service.getMe with userId from request', async () => {
      const mockRequest = {
        user: { userId: 'user-1', email: 'test@example.com' },
      };
      jest.spyOn(service, 'getMe').mockResolvedValue(mockUserResponse);

      const result = await controller.getMe(mockRequest as any);

      expect(service.getMe).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(mockUserResponse);
    });
  });

  describe('findOne', () => {
    it('allows self access', async () => {
      const req = { user: { userId: 'user-1' } } as any;
      jest.spyOn(service, 'findOne').mockResolvedValue(mockUserResponse);
      await expect(controller.findOne('user-1', req)).resolves.toEqual(
        mockUserResponse,
      );
    });

    it('forbids access to other users', async () => {
      const req = { user: { userId: 'user-1' } } as any;
      await expect(controller.findOne('user-2', req)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('update', () => {
    it('allows self update', async () => {
      const req = { user: { userId: 'user-1' } } as any;
      const updateDto = { name: 'Updated Name' };
      const updated = { ...mockUserResponse, name: 'Updated Name' };
      jest.spyOn(service, 'update').mockResolvedValue(updated);

      const result = await controller.update('user-1', updateDto, req);
      expect(service.update).toHaveBeenCalledWith('user-1', updateDto);
      expect(result).toEqual(updated);
    });
  });

  describe('softDelete', () => {
    it('allows self delete', async () => {
      const req = { user: { userId: 'user-1' } } as any;
      jest.spyOn(service, 'softDelete').mockResolvedValue(mockUserResponse);
      await controller.softDelete('user-1', req);
      expect(service.softDelete).toHaveBeenCalledWith('user-1');
    });
  });
});
