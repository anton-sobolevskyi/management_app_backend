import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskResponseDto } from './dto/task-response.dto';
import {
  PaginatedResponseDto,
  PaginationQueryDto,
  paginate,
  paginationArgs,
} from '../common/dto/pagination.dto';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  private async assertAssigneeIsMember(
    projectId: string,
    assignedToId?: string | null,
  ) {
    if (!assignedToId) return;

    const membership = await this.prisma.projectMember.findUnique({
      where: {
        userId_projectId: { userId: assignedToId, projectId },
      },
    });

    if (!membership) {
      throw new BadRequestException(
        'Assignee must be a member of the project',
      );
    }
  }

  async create(
    projectId: string,
    dto: CreateTaskDto,
    createdById: string,
  ): Promise<TaskResponseDto> {
    await this.assertAssigneeIsMember(projectId, dto.assignedToId);

    return this.prisma.task.create({
      data: {
        ...dto,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        projectId,
        createdById,
      },
    });
  }

  async findAll(
    projectId: string,
    filters?: { status?: string; assignedToId?: string },
    query: PaginationQueryDto = {},
  ): Promise<PaginatedResponseDto<TaskResponseDto>> {
    const { page, limit, skip } = paginationArgs(query);
    const where = {
      projectId,
      deletedAt: null as null,
      ...(filters?.status && { status: filters.status as any }),
      ...(filters?.assignedToId && { assignedToId: filters.assignedToId }),
    };

    const [total, data] = await Promise.all([
      this.prisma.task.count({ where }),
      this.prisma.task.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return paginate(data, total, page, limit);
  }

  async findOne(id: string): Promise<TaskResponseDto> {
    const task = await this.prisma.task.findFirst({
      where: { id, deletedAt: null },
      include: { comments: true, attachments: true },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return task;
  }

  async update(id: string, dto: UpdateTaskDto): Promise<TaskResponseDto> {
    const existing = await this.prisma.task.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    if (dto.assignedToId !== undefined) {
      await this.assertAssigneeIsMember(existing.projectId, dto.assignedToId);
    }

    return this.prisma.task.update({
      where: { id },
      data: {
        ...dto,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
    });
  }

  async softDelete(id: string): Promise<TaskResponseDto> {
    await this.findOne(id);

    const now = new Date();

    await this.prisma.comment.updateMany({
      where: { taskId: id, deletedAt: null },
      data: { deletedAt: now },
    });

    return this.prisma.task.update({
      where: { id },
      data: { deletedAt: now },
    });
  }
}
