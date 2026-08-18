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
      jest.spyOn(service, 'create').mockResolvedValue(mockUserResponse);

      const result = await controller.create(dto);

      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockUserResponse);
    });
  });

  describe('findAll', () => {
    it('should call service.findAll and return user list', async () => {
      jest.spyOn(service, 'findAll').mockResolvedValue([mockUserResponse]);

      const result = await controller.findAll();

      expect(service.findAll).toHaveBeenCalled();
      expect(result).toEqual([mockUserResponse]);
    });
  });

  describe('findOne', () => {
    it('should call service.findOne with id and return user', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(mockUserResponse);

      const result = await controller.findOne('user-1');

      expect(service.findOne).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(mockUserResponse);
    });
  });

  describe('update', () => {
    it('should call service.update with id and dto', async () => {
      const updateDto = { name: 'Updated Name' };
      const updatedUser = { ...mockUserResponse, name: 'Updated Name' };
      jest.spyOn(service, 'update').mockResolvedValue(updatedUser);

      const result = await controller.update('user-1', updateDto);

      expect(service.update).toHaveBeenCalledWith('user-1', updateDto);
      expect(result).toEqual(updatedUser);
    });
  });

  describe('softDelete', () => {
    it('should call service.softDelete with id', async () => {
      jest.spyOn(service, 'softDelete').mockResolvedValue(mockUserResponse);

      const result = await controller.softDelete('user-1');

      expect(service.softDelete).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(mockUserResponse);
    });
  });
});
