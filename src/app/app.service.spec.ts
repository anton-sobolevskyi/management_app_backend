import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from './app.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AppService', () => {
  let service: AppService;
  const prisma = { $queryRaw: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AppService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<AppService>(AppService);
  });

  it('liveness does not touch the database', () => {
    expect(service.healthCheck()).toEqual({ status: 'Ok' });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('readiness reports the database as up', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    await expect(service.readiness()).resolves.toEqual({
      status: 'ok',
      database: 'up',
    });
  });

  it('readiness answers 503 when the database is unreachable', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connect ECONNREFUSED'));
    await expect(service.readiness()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
