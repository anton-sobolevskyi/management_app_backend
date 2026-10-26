import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AttachmentsService,
  StoredObject,
} from '../attachments/attachments.service';
import type { Prisma } from '../generated/prisma/client';
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
import { USER_PUBLIC_SELECT } from '../users/user-select';

const MEMBER_PREVIEW_LIMIT = 20;
const MEMBER_DETAIL_LIMIT = 100;
const TX_TIMEOUT_MS = 20_000;

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

    // One grouped query for the whole page: total and finished tasks per project
    const grouped = await this.prisma.task.groupBy({
      by: ['projectId', 'status'],
      where: { projectId: { in: data.map((p) => p.id) }, deletedAt: null },
      _count: { _all: true },
    });
    const counts = new Map<string, { total: number; done: number }>();
    for (const row of grouped) {
      const entry = counts.get(row.projectId) ?? { total: 0, done: 0 };
      entry.total += row._count._all;
      if (row.status === 'DONE') {
        entry.done += row._count._all;
      }
      counts.set(row.projectId, entry);
    }

    return paginate(
      data.map(({ _count, ...project }) => ({
        ...project,
        memberCount: _count.members,
        taskCount: counts.get(project.id)?.total ?? 0,
        doneTaskCount: counts.get(project.id)?.done ?? 0,
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
        // Capped like the list view; GET /projects/:id/members pages through all
        members: {
          orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
          take: MEMBER_DETAIL_LIMIT,
          include: {
            user: { select: USER_PUBLIC_SELECT },
          },
        },
        _count: { select: { members: true } },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const { _count, ...rest } = project;
    return { ...rest, memberCount: _count.members };
  }

  /** Cheap existence check; the guard already proved membership. */
  private async assertExists(id: string): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }
  }

  async update(id: string, dto: UpdateProjectDto): Promise<ProjectResponseDto> {
    await this.assertExists(id);

    return this.prisma.project.update({
      where: { id },
      data: dto,
      include: { members: true },
    });
  }

  async softDelete(id: string): Promise<ProjectResponseDto> {
    await this.assertExists(id);

    // All-or-nothing in the database; files are removed only after commit
    const { project, stored } = await this.prisma.$transaction(
      (tx) => this.softDeleteInTx(tx, id),
      { timeout: TX_TIMEOUT_MS },
    );

    await this.attachmentsService.purgeObjects(stored);

    return project;
  }

  /**
   * Soft-delete a project (with its tasks, comments and attachment rows)
   * inside the caller's transaction. The caller must purge the returned
   * `stored` objects from S3 after the transaction commits.
   *
   * Uses relation filters instead of loading ids, so cost doesn't grow with
   * the size of `IN (...)` lists.
   */
  async softDeleteInTx(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<{ project: ProjectResponseDto; stored: StoredObject[] }> {
    const now = new Date();

    // Attachments of already-deleted tasks were removed when those were deleted
    const stored = await this.attachmentsService.detachFor(tx, {
      projectId: id,
    });

    await tx.comment.updateMany({
      where: { deletedAt: null, task: { projectId: id } },
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
  }
}
