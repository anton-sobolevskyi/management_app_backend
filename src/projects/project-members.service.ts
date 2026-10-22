import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../generated/prisma/enums';
import type { Prisma } from '../generated/prisma/client';
import { AddProjectMemberDto } from './dto/add-project-member.dto';
import { UpdateProjectMemberDto } from './dto/update-project-member.dto';
import { ProjectMemberResponseDto } from './dto/project-member-response.dto';
import { normalizeEmail } from '../common/utils/email';
import {
  PaginatedResponseDto,
  PaginationQueryDto,
  paginate,
  paginationArgs,
} from '../common/dto/pagination.dto';

const memberUserSelect = {
  id: true,
  email: true,
  name: true,
  avatarId: true,
  createdAt: true,
} as const;

@Injectable()
export class ProjectMembersService {
  constructor(private prisma: PrismaService) {}

  async findAll(
    projectId: string,
    query: PaginationQueryDto = {},
  ): Promise<PaginatedResponseDto<ProjectMemberResponseDto>> {
    const { page, limit, skip } = paginationArgs(query);
    const where = { projectId };

    const [total, data] = await Promise.all([
      this.prisma.projectMember.count({ where }),
      this.prisma.projectMember.findMany({
        where,
        include: { user: { select: memberUserSelect } },
        orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
        skip,
        take: limit,
      }),
    ]);

    return paginate(data, total, page, limit);
  }

  async add(
    projectId: string,
    dto: AddProjectMemberDto,
  ): Promise<ProjectMemberResponseDto> {
    const role = dto.role ?? Role.MEMBER;

    if (role === Role.OWNER) {
      throw new BadRequestException(
        'Cannot assign OWNER via invite; use transfer ownership',
      );
    }

    const user = await this.prisma.user.findFirst({
      where: { email: normalizeEmail(dto.email), deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existing = await this.prisma.projectMember.findUnique({
      where: {
        userId_projectId: { userId: user.id, projectId },
      },
    });

    if (existing) {
      throw new ConflictException('User is already a project member');
    }

    // A concurrent duplicate add hits the (userId, projectId) unique index;
    // the exception filter turns that P2002 into a 409.
    return this.prisma.projectMember.create({
      data: {
        projectId,
        userId: user.id,
        role,
      },
      include: { user: { select: memberUserSelect } },
    });
  }

  async updateRole(
    projectId: string,
    targetUserId: string,
    dto: UpdateProjectMemberDto,
    actorUserId: string,
  ): Promise<ProjectMemberResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockProject(tx, projectId);

      const actor = await tx.projectMember.findUnique({
        where: {
          userId_projectId: { userId: actorUserId, projectId },
        },
      });

      if (!actor) {
        throw new NotFoundException('Project not found');
      }

      const membership = await tx.projectMember.findUnique({
        where: {
          userId_projectId: { userId: targetUserId, projectId },
        },
      });

      if (!membership) {
        throw new NotFoundException('Member not found');
      }

      // Only OWNER may grant or change OWNER role
      if (dto.role === Role.OWNER || membership.role === Role.OWNER) {
        if (actor.role !== Role.OWNER) {
          throw new ForbiddenException(
            'Only the project OWNER can change OWNER roles',
          );
        }
      }

      if (membership.role === Role.OWNER && dto.role !== Role.OWNER) {
        await this.assertNotLastOwner(tx, projectId);
      }

      return tx.projectMember.update({
        where: { id: membership.id },
        data: { role: dto.role },
        include: { user: { select: memberUserSelect } },
      });
    });
  }

  /**
   * Transfer OWNER to another member in one transaction.
   * Previous owner becomes ADMIN.
   */
  async transferOwnership(
    projectId: string,
    newOwnerUserId: string,
    actorUserId: string,
  ): Promise<ProjectMemberResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockProject(tx, projectId);

      const actor = await tx.projectMember.findUnique({
        where: {
          userId_projectId: { userId: actorUserId, projectId },
        },
      });

      if (!actor || actor.role !== Role.OWNER) {
        throw new ForbiddenException('Only the OWNER can transfer ownership');
      }

      if (newOwnerUserId === actorUserId) {
        throw new BadRequestException('You are already the OWNER');
      }

      const target = await tx.projectMember.findUnique({
        where: {
          userId_projectId: { userId: newOwnerUserId, projectId },
        },
      });

      if (!target) {
        throw new NotFoundException('Target user is not a project member');
      }

      await tx.projectMember.update({
        where: { id: actor.id },
        data: { role: Role.ADMIN },
      });

      return tx.projectMember.update({
        where: { id: target.id },
        data: { role: Role.OWNER },
        include: { user: { select: memberUserSelect } },
      });
    });
  }

  async remove(
    projectId: string,
    targetUserId: string,
    actorUserId: string,
  ): Promise<ProjectMemberResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockProject(tx, projectId);

      const actor = await tx.projectMember.findUnique({
        where: {
          userId_projectId: { userId: actorUserId, projectId },
        },
      });

      if (!actor) {
        throw new NotFoundException('Project not found');
      }

      const membership = await tx.projectMember.findUnique({
        where: {
          userId_projectId: { userId: targetUserId, projectId },
        },
      });

      if (!membership) {
        throw new NotFoundException('Member not found');
      }

      const isSelf = targetUserId === actorUserId;
      const actorIsAdmin =
        actor.role === Role.OWNER || actor.role === Role.ADMIN;

      // Self-leave allowed for any member; removing others requires OWNER/ADMIN
      if (!isSelf && !actorIsAdmin) {
        throw new ForbiddenException(
          'Only OWNER or ADMIN can remove other members',
        );
      }

      // ADMIN cannot remove OWNER
      if (
        !isSelf &&
        membership.role === Role.OWNER &&
        actor.role !== Role.OWNER
      ) {
        throw new ForbiddenException('Only OWNER can remove another OWNER');
      }

      if (membership.role === Role.OWNER) {
        await this.assertNotLastOwner(tx, projectId);
      }

      // Assignees must be project members; keep that true after they leave
      await tx.task.updateMany({
        where: { projectId, assignedToId: targetUserId },
        data: { assignedToId: null },
      });

      return tx.projectMember.delete({
        where: { id: membership.id },
        include: { user: { select: memberUserSelect } },
      });
    });
  }

  /**
   * Serialises owner/role changes of one project. Without it, two owners
   * demoting each other at the same moment both pass the "not the last
   * owner" check and leave the project with none.
   */
  private async lockProject(tx: Prisma.TransactionClient, projectId: string) {
    await tx.$queryRaw`SELECT "id" FROM "projects" WHERE "id" = ${projectId} FOR UPDATE`;
  }

  private async assertNotLastOwner(
    tx: Prisma.TransactionClient,
    projectId: string,
  ) {
    const ownerCount = await tx.projectMember.count({
      where: { projectId, role: Role.OWNER },
    });

    if (ownerCount <= 1) {
      throw new ForbiddenException(
        'Cannot remove or demote the last OWNER of the project',
      );
    }
  }
}
