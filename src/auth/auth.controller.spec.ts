import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UnauthorizedException } from '@nestjs/common';
import { Response } from 'express';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  const mockResponse = {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  } as unknown as Response;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            register: jest.fn(),
            login: jest.fn(),
            refreshTokens: jest.fn(),
            logout: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('should register user and set cookie', async () => {
      jest.spyOn(authService, 'register').mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' });
      const result = await controller.register({ email: 'test@test.com', password: 'password', name: 'Test' }, mockResponse);
      expect(result).toEqual({ accessToken: 'at' });
      expect(mockResponse.cookie).toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('should throw UnauthorizedException if no user in request', async () => {
      await expect(controller.login({ email: 'test@test.com', password: 'password' }, {} as any, mockResponse)).rejects.toThrow(UnauthorizedException);
    });

    it('should login and set cookie', async () => {
      const req = { user: { id: '1', email: 'test@test.com' } } as any;
      jest.spyOn(authService, 'login').mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' });
      const result = await controller.login({ email: 'test@test.com', password: 'password' }, req, mockResponse);
      expect(result).toEqual({ accessToken: 'at' });
      expect(mockResponse.cookie).toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should clear cookie', async () => {
      const req = { cookies: { refreshToken: 'rt' } } as any;
      jest.spyOn(authService, 'logout').mockResolvedValue(undefined);
      const result = await controller.logout(req, mockResponse);
      expect(result).toEqual({ message: 'Logged out successfully' });
      expect(mockResponse.clearCookie).toHaveBeenCalledWith('refreshToken');
    });
  });
});
