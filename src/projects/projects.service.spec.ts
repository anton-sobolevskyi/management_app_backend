import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../generated/prisma/enums';

describe('ProjectsService', () => {
  let service: ProjectsService;
  let prisma: PrismaService;

  const mockProject = {
    id: 'project-1',
    name: 'Project Alpha',
    description: 'Description Alpha',
    deletedAt: null,
    members: [{ userId: 'user-1', role: Role.OWNER }],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        {
          provide: PrismaService,
          useValue: {
            project: {
              create: jest.fn(),
              findMany: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
            },
            task: {
              updateMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('create', () => {
    it('should create a project', async () => {
      jest.spyOn(prisma.project, 'create').mockResolvedValue(mockProject as any);
      const result = await service.create({ name: 'Project Alpha', description: 'Description Alpha' }, 'user-1');
      expect(result).toEqual(mockProject);
    });
  });

  describe('findAll', () => {
    it('should return all projects for a user', async () => {
      jest.spyOn(prisma.project, 'findMany').mockResolvedValue([mockProject] as any);
      const result = await service.findAll('user-1');
      expect(result).toEqual([mockProject]);
    });
  });

  describe('findOne', () => {
    it('should return a project', async () => {
      jest.spyOn(prisma.project, 'findFirst').mockResolvedValue(mockProject as any);
      const result = await service.findOne('project-1');
      expect(result).toEqual(mockProject);
    });

    it('should throw NotFoundException if project not found', async () => {
      jest.spyOn(prisma.project, 'findFirst').mockResolvedValue(null);
      await expect(service.findOne('project-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a project', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(mockProject as any);
      jest.spyOn(prisma.project, 'update').mockResolvedValue(mockProject as any);
      const result = await service.update('project-1', { name: 'New Name' });
      expect(result).toEqual(mockProject);
    });
  });

  describe('softDelete', () => {
    it('should soft delete a project', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValue(mockProject as any);
      jest.spyOn(prisma.task, 'updateMany').mockResolvedValue({ count: 1 } as any);
      jest.spyOn(prisma.project, 'update').mockResolvedValue(mockProject as any);
      const result = await service.softDelete('project-1');
      expect(result).toEqual(mockProject);
    });
  });
});
