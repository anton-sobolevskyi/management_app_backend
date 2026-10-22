import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let controller: AppController;
  const appService = {
    healthCheck: jest.fn().mockReturnValue({ status: 'Ok' }),
    readiness: jest.fn().mockResolvedValue({ status: 'ok', database: 'up' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: AppService, useValue: appService }],
    }).compile();

    controller = module.get<AppController>(AppController);
  });

  it('GET / is the cheap liveness probe', () => {
    expect(controller.healthCheck()).toEqual({ status: 'Ok' });
  });

  it('GET /health checks readiness', async () => {
    await expect(controller.readiness()).resolves.toEqual({
      status: 'ok',
      database: 'up',
    });
    expect(appService.readiness).toHaveBeenCalled();
  });
});
