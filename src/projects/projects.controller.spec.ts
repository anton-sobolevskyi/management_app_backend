import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectMemberGuard } from '../common/authorization/project-member.guard';

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
    })
      .overrideGuard(ProjectMemberGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ProjectsController>(ProjectsController);
    service = module.get<ProjectsService>(ProjectsService);
  });

  it('should create a project', async () => {
    const dto = { name: 'Test', description: 'Desc' };
    jest.spyOn(service, 'create').mockResolvedValue({ id: '1' } as any);
    expect(await controller.create(dto, 'user-1')).toEqual({ id: '1' });
    expect(service.create).toHaveBeenCalledWith(dto, 'user-1');
  });

  it('should find all projects', async () => {
    const page = {
      data: [],
      meta: { total: 0, page: 1, limit: 20, totalPages: 1 },
    };
    jest.spyOn(service, 'findAll').mockResolvedValue(page);
    expect(await controller.findAll('user-1', {})).toEqual(page);
    expect(service.findAll).toHaveBeenCalledWith('user-1', {});
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
