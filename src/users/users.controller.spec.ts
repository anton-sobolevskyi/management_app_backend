import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

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
            create: jest.fn(),
            findAll: jest.fn(),
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

  describe('create', () => {
    it('should call service.create with DTO and return result', async () => {
      const dto = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      };
      const spy = jest
        .spyOn(service, 'create')
        .mockResolvedValue(mockUserResponse);

      const result = await controller.create(dto);

      expect(spy).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockUserResponse);
    });
  });

  describe('findAll', () => {
    it('should call service.findAll and return user list', async () => {
      const spy = jest
        .spyOn(service, 'findAll')
        .mockResolvedValue([mockUserResponse]);

      const result = await controller.findAll();

      expect(spy).toHaveBeenCalled();
      expect(result).toEqual([mockUserResponse]);
    });
  });

  describe('findOne', () => {
    it('should call service.findOne with id and return user', async () => {
      const spy = jest
        .spyOn(service, 'findOne')
        .mockResolvedValue(mockUserResponse);

      const result = await controller.findOne('user-1');

      expect(spy).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(mockUserResponse);
    });
  });

  describe('update', () => {
    it('should call service.update with id and dto', async () => {
      const updateDto = { name: 'Updated Name' };
      const updatedUser = { ...mockUserResponse, name: 'Updated Name' };
      const spy = jest.spyOn(service, 'update').mockResolvedValue(updatedUser);

      const result = await controller.update('user-1', updateDto);

      expect(spy).toHaveBeenCalledWith('user-1', updateDto);
      expect(result).toEqual(updatedUser);
    });
  });

  describe('getMe', () => {
    it('should call service.getMe with userId from request and return user', async () => {
      const mockRequest = {
        user: { userId: 'user-1', email: 'test@example.com' },
      };
      const spy = jest
        .spyOn(service, 'getMe')
        .mockResolvedValue(mockUserResponse);

      const result = await controller.getMe(mockRequest as any);

      expect(spy).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(mockUserResponse);
    });
  });

  describe('softDelete', () => {
    it('should call service.softDelete with id', async () => {
      const spy = jest
        .spyOn(service, 'softDelete')
        .mockResolvedValue(mockUserResponse);

      const result = await controller.softDelete('user-1');

      expect(spy).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(mockUserResponse);
    });
  });
});
