import { Test, TestingModule } from '@nestjs/testing';
import { ProjectMembersController } from './project-members.controller';
import { ProjectMembersService } from './project-members.service';
import { ProjectMemberGuard } from '../common/authorization/project-member.guard';
import { Role } from '../generated/prisma/enums';

describe('ProjectMembersController', () => {
  let controller: ProjectMembersController;
  let service: ProjectMembersService;

  const mockService = {
    findAll: jest.fn(),
    add: jest.fn(),
    updateRole: jest.fn(),
    remove: jest.fn(),
    transferOwnership: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectMembersController],
      providers: [{ provide: ProjectMembersService, useValue: mockService }],
    })
      .overrideGuard(ProjectMemberGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(ProjectMembersController);
    service = module.get(ProjectMembersService);
    jest.clearAllMocks();
  });

  it('lists members', async () => {
    mockService.findAll.mockResolvedValue({ data: [], meta: {} });
    await controller.findAll('p1', {});
    expect(service.findAll).toHaveBeenCalledWith('p1', {});
  });

  it('adds a member', async () => {
    const dto = { email: 'bob@example.com', role: Role.MEMBER };
    mockService.add.mockResolvedValue({ id: 'm1' });
    await controller.add('p1', dto);
    expect(service.add).toHaveBeenCalledWith('p1', dto);
  });

  it('updates role', async () => {
    const dto = { role: Role.ADMIN };
    mockService.updateRole.mockResolvedValue({ id: 'm1' });
    await controller.updateRole('p1', 'u2', dto, 'u1');
    expect(service.updateRole).toHaveBeenCalledWith('p1', 'u2', dto, 'u1');
  });

  it('removes a member', async () => {
    mockService.remove.mockResolvedValue({ id: 'm1' });
    await controller.remove('p1', 'u2', 'u1');
    expect(service.remove).toHaveBeenCalledWith('p1', 'u2', 'u1');
  });
});
