import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskResponseDto } from './dto/task-response.dto';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  async create(
    projectId: string,
    dto: CreateTaskDto,
    createdById: string,
  ): Promise<TaskResponseDto> {
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
  ): Promise<TaskResponseDto[]> {
    return this.prisma.task.findMany({
      where: {
        projectId,
        deletedAt: null,
        ...(filters?.status && { status: filters.status as any }),
        ...(filters?.assignedToId && { assignedToId: filters.assignedToId }),
      },
      orderBy: { createdAt: 'desc' },
    });
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
    await this.findOne(id);

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

    await this.prisma.comment.updateMany({
      where: { taskId: id, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    return this.prisma.task.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
