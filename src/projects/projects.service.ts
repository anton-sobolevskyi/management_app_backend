import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectResponseDto } from './dto/project-response.dto';
import { Role } from '../generated/prisma/enums';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  async create(
    dto: CreateProjectDto,
    ownerId: string,
  ): Promise<ProjectResponseDto> {
    return this.prisma.project.create({
      data: {
        name: dto.name,
        description: dto.description,
        members: {
          create: { userId: ownerId, role: Role.OWNER },
        },
      },
      include: { members: true },
    });
  }

  async findAll(userId: string): Promise<ProjectResponseDto[]> {
    return this.prisma.project.findMany({
      where: {
        deletedAt: null,
        members: { some: { userId } },
      },
      include: { members: true },
    });
  }

  async findOne(id: string): Promise<ProjectResponseDto> {
    const project = await this.prisma.project.findFirst({
      where: { id, deletedAt: null },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                avatarId: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  async update(id: string, dto: UpdateProjectDto): Promise<ProjectResponseDto> {
    await this.findOne(id);

    return this.prisma.project.update({
      where: { id },
      data: dto,
      include: { members: true },
    });
  }

  async softDelete(id: string): Promise<ProjectResponseDto> {
    await this.findOne(id);

    await this.prisma.task.updateMany({
      where: { projectId: id, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    return this.prisma.project.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: { members: true },
    });
  }
}
