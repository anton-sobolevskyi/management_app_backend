import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

describe('ProjectsController', () => {
  let controller: ProjectsController;
  let service: ProjectsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [
        {
          provide: ProjectsService,
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

    controller = module.get<ProjectsController>(ProjectsController);
    service = module.get<ProjectsService>(ProjectsService);
  });

  it('should create a project', async () => {
    const dto = { name: 'Test', description: 'Desc' };
    const req = { user: { userId: '1' } } as any;
    jest.spyOn(service, 'create').mockResolvedValue({ id: '1' } as any);
    expect(await controller.create(dto, req)).toEqual({ id: '1' });
  });

  it('should find all projects', async () => {
    const req = { user: { userId: '1' } } as any;
    jest.spyOn(service, 'findAll').mockResolvedValue([]);
    expect(await controller.findAll(req)).toEqual([]);
  });

  it('should find one project', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: '1' } as any);
    expect(await controller.findOne('1')).toEqual({ id: '1' });
  });

  it('should update a project', async () => {
    jest.spyOn(service, 'update').mockResolvedValue({ id: '1' } as any);
    expect(await controller.update('1', { name: 'New' })).toEqual({ id: '1' });
  });

  it('should delete a project', async () => {
    jest.spyOn(service, 'softDelete').mockResolvedValue({ id: '1' } as any);
    expect(await controller.softDelete('1')).toEqual({ id: '1' });
  });
});
