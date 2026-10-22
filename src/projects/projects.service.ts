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

const MEMBER_PREVIEW_LIMIT = 20;

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
      deletedAt: null,
      members: { some: { userId } },
    };

    const [total, data] = await Promise.all([
      this.prisma.project.count({ where }),
      this.prisma.project.findMany({
        where,
        include: {
          // A list view doesn't need every member of every project
          members: { orderBy: { joinedAt: 'asc' }, take: MEMBER_PREVIEW_LIMIT },
          _count: { select: { members: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
      }),
    ]);

    return paginate(
      data.map(({ _count, ...project }) => ({
        ...project,
        memberCount: _count.members,
      })),
      total,
      page,
      limit,
    );
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

    // All-or-nothing in the database; files are removed only after commit
    const { project, stored } = await this.prisma.$transaction(async (tx) => {
      const tasks = await tx.task.findMany({
        where: { projectId: id, deletedAt: null },
        select: { id: true },
      });
      const taskIds = tasks.map((t) => t.id);

      // Attachments of already-deleted tasks were removed when those were deleted
      const comments = await tx.comment.findMany({
        where: { taskId: { in: taskIds }, deletedAt: null },
        select: { id: true },
      });

      const stored = await this.attachmentsService.detachFor(tx, {
        taskIds,
        commentIds: comments.map((c) => c.id),
      });

      await tx.comment.updateMany({
        where: { taskId: { in: taskIds }, deletedAt: null },
        data: { deletedAt: now },
      });

      await tx.task.updateMany({
        where: { projectId: id, deletedAt: null },
        data: { deletedAt: now },
      });

      const project = await tx.project.update({
        where: { id },
        data: { deletedAt: now },
        include: { members: true },
      });

      return { project, stored };
    });

    await this.attachmentsService.purgeObjects(stored);

    return project;
  }
}
