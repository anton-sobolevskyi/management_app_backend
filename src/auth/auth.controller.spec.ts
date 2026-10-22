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
      jest.spyOn(authService, 'register').mockResolvedValue({
        accessToken: 'at',
        refreshToken: 'rt',
        expiresIn: 900,
      });
      const result = await controller.register(
        { email: 'test@test.com', password: 'password', name: 'Test' },
        mockResponse,
      );
      // refresh token goes to the cookie only, never into the body
      expect(result).toEqual({ accessToken: 'at', expiresIn: 900 });
      expect(mockResponse.cookie).toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('should login and set cookie', async () => {
      const user = { userId: '1', email: 'test@test.com' };
      jest.spyOn(authService, 'login').mockResolvedValue({
        accessToken: 'at',
        refreshToken: 'rt',
        expiresIn: 900,
      });
      const result = await controller.login(
        { email: 'test@test.com', password: 'password' },
        user,
        mockResponse,
      );
      expect(result).toEqual({ accessToken: 'at', expiresIn: 900 });
      expect(authService.login).toHaveBeenCalledWith('1', 'test@test.com');
      expect(mockResponse.cookie).toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should clear cookie', async () => {
      const req = { cookies: { refreshToken: 'rt' } } as any;
      jest.spyOn(authService, 'logout').mockResolvedValue(undefined);
      const result = await controller.logout(req, mockResponse);
      expect(result).toEqual({ message: 'Logged out successfully' });
      // must use the same path as the Set-Cookie, or browsers keep the cookie
      expect(mockResponse.clearCookie).toHaveBeenCalledWith(
        'refreshToken',
        expect.objectContaining({ path: '/auth', httpOnly: true }),
      );
    });
  });

  describe('refresh', () => {
    it('should rotate the cookie and return only the access token (+ expiresIn)', async () => {
      const req = { cookies: { refreshToken: 'old' } } as any;
      jest.spyOn(authService, 'refreshTokens').mockResolvedValue({
        accessToken: 'at2',
        refreshToken: 'rt2',
        expiresIn: 900,
      });

      const result = await controller.refresh(req, mockResponse);

      expect(result).toEqual({ accessToken: 'at2', expiresIn: 900 });
      expect(authService.refreshTokens).toHaveBeenCalledWith('old');
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'rt2',
        expect.objectContaining({
          httpOnly: true,
          path: '/auth',
          maxAge: 604800000,
        }),
      );
    });

    it('should throw UnauthorizedException without a cookie', async () => {
      await expect(
        controller.refresh({ cookies: {} } as any, mockResponse),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should answer 200, not the POST default of 201', () => {
      const status = Reflect.getMetadata(
        '__httpCode__',
        AuthController.prototype.refresh,
      );
      expect(status).toBe(200);
    });
  });
});
