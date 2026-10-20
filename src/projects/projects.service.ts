import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectResponseDto } from './dto/project-response.dto';
import { Role } from '../generated/prisma/enums';
import {
  PaginatedResponseDto,
  PaginationQueryDto,
  paginate,
  paginationArgs,
} from '../common/dto/pagination.dto';

@Injectable()
export class ProjectsService {
  constructor(
    private prisma: PrismaService,
    private attachmentsService: AttachmentsService,
  ) {}

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

  async findAll(
    userId: string,
    query: PaginationQueryDto = {},
  ): Promise<PaginatedResponseDto<ProjectResponseDto>> {
    const { page, limit, skip } = paginationArgs(query);
    const where = {
      deletedAt: null as null,
      members: { some: { userId } },
    };

    const [total, data] = await Promise.all([
      this.prisma.project.count({ where }),
      this.prisma.project.findMany({
        where,
        include: { members: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return paginate(data, total, page, limit);
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

    const now = new Date();

    const tasks = await this.prisma.task.findMany({
      where: { projectId: id, deletedAt: null },
      select: { id: true },
    });
    const taskIds = tasks.map((t) => t.id);

    if (taskIds.length > 0) {
      const comments = await this.prisma.comment.findMany({
        where: { taskId: { in: taskIds }, deletedAt: null },
        select: { id: true },
      });
      const commentIds = comments.map((c) => c.id);

      await this.attachmentsService.removeForComments(commentIds);
      await this.attachmentsService.removeForTasks(taskIds);

      await this.prisma.comment.updateMany({
        where: { taskId: { in: taskIds }, deletedAt: null },
        data: { deletedAt: now },
      });
    }

    await this.prisma.task.updateMany({
      where: { projectId: id, deletedAt: null },
      data: { deletedAt: now },
    });

    return this.prisma.project.update({
      where: { id },
      data: { deletedAt: now },
      include: { members: true },
    });
  }
}
