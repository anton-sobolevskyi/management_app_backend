import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskResponseDto } from './dto/task-response.dto';
import { TaskStatus } from '../generated/prisma/enums';
import type { Prisma } from '../generated/prisma/client';
import { ATTACHMENT_PUBLIC_SELECT } from '../attachments/attachments.constants';
import {
  PaginatedResponseDto,
  PaginationQueryDto,
  paginate,
  paginationArgs,
} from '../common/dto/pagination.dto';

export type TaskListFilters = {
  status?: TaskStatus;
  assignedToId?: string;
  q?: string;
  dueBefore?: string;
  dueAfter?: string;
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value: string, field: string): Date {
  const date = new Date(value);
  // Some ISO 8601 forms (week/ordinal dates) pass validation but not Date().
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${field} must be a valid ISO 8601 date`);
  }
  return date;
}

/** undefined = leave unchanged, null = clear, string = set. */
function toDueDate(value: string | null | undefined): Date | null | undefined {
  return typeof value === 'string' ? parseDate(value, 'dueDate') : value;
}

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private attachmentsService: AttachmentsService,
  ) {}

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
      throw new BadRequestException('Assignee must be a member of the project');
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
        dueDate: toDueDate(dto.dueDate),
        projectId,
        createdById,
      },
    });
  }

  async findAll(
    projectId: string,
    filters: TaskListFilters = {},
    query: PaginationQueryDto = {},
  ): Promise<PaginatedResponseDto<TaskResponseDto>> {
    const { page, limit, skip } = paginationArgs(query);

    const where: Prisma.TaskWhereInput = {
      projectId,
      deletedAt: null,
    };

    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.assignedToId) {
      where.assignedToId = filters.assignedToId;
    }
    if (filters.q?.trim()) {
      where.OR = [
        { title: { contains: filters.q.trim(), mode: 'insensitive' } },
        { description: { contains: filters.q.trim(), mode: 'insensitive' } },
      ];
    }
    if (filters.dueBefore || filters.dueAfter) {
      const dueDate: Prisma.DateTimeNullableFilter = {};
      if (filters.dueAfter) {
        dueDate.gte = parseDate(filters.dueAfter, 'dueAfter');
      }
      if (filters.dueBefore) {
        // "2026-10-31" should include tasks due any time on the 31st
        dueDate.lte = parseDate(
          DATE_ONLY.test(filters.dueBefore)
            ? `${filters.dueBefore}T23:59:59.999Z`
            : filters.dueBefore,
          'dueBefore',
        );
      }
      where.dueDate = dueDate;
    }

    const [total, data] = await Promise.all([
      this.prisma.task.count({ where }),
      this.prisma.task.findMany({
        where,
        // id breaks ties so pages never repeat or skip rows
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
      }),
    ]);

    return paginate(data, total, page, limit);
  }

  async findOne(id: string): Promise<TaskResponseDto> {
    const task = await this.prisma.task.findFirst({
      where: { id, deletedAt: null },
      include: {
        // soft-deleted comments must not leak through the task detail
        comments: {
          where: { deletedAt: null },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
        attachments: { select: ATTACHMENT_PUBLIC_SELECT },
      },
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
        dueDate: toDueDate(dto.dueDate),
      },
    });
  }

  async softDelete(id: string): Promise<TaskResponseDto> {
    const exists = await this.prisma.task.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException('Task not found');
    }

    const now = new Date();

    // All-or-nothing in the database; files are removed only after commit
    const { task, stored } = await this.prisma.$transaction(async (tx) => {
      const comments = await tx.comment.findMany({
        where: { taskId: id, deletedAt: null },
        select: { id: true },
      });

      const stored = await this.attachmentsService.detachFor(tx, {
        taskIds: [id],
        commentIds: comments.map((c) => c.id),
      });

      await tx.comment.updateMany({
        where: { taskId: id, deletedAt: null },
        data: { deletedAt: now },
      });

      const task = await tx.task.update({
        where: { id },
        data: { deletedAt: now },
      });

      return { task, stored };
    });

    await this.attachmentsService.purgeObjects(stored);

    return task;
  }
}
