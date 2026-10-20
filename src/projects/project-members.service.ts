import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../generated/prisma/enums';
import { AddProjectMemberDto } from './dto/add-project-member.dto';
import { UpdateProjectMemberDto } from './dto/update-project-member.dto';
import { ProjectMemberResponseDto } from './dto/project-member-response.dto';
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
        orderBy: { joinedAt: 'asc' },
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
      where: { email: dto.email, deletedAt: null },
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
    const actor = await this.prisma.projectMember.findUnique({
      where: {
        userId_projectId: { userId: actorUserId, projectId },
      },
    });

    if (!actor) {
      throw new NotFoundException('Project not found');
    }

    const membership = await this.prisma.projectMember.findUnique({
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
      await this.assertNotLastOwner(projectId);
    }

    return this.prisma.projectMember.update({
      where: { id: membership.id },
      data: { role: dto.role },
      include: { user: { select: memberUserSelect } },
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
    const actor = await this.prisma.projectMember.findUnique({
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

    const target = await this.prisma.projectMember.findUnique({
      where: {
        userId_projectId: { userId: newOwnerUserId, projectId },
      },
    });

    if (!target) {
      throw new NotFoundException('Target user is not a project member');
    }

    await this.prisma.$transaction([
      this.prisma.projectMember.update({
        where: { id: actor.id },
        data: { role: Role.ADMIN },
      }),
      this.prisma.projectMember.update({
        where: { id: target.id },
        data: { role: Role.OWNER },
      }),
    ]);

    return this.prisma.projectMember.findUniqueOrThrow({
      where: { id: target.id },
      include: { user: { select: memberUserSelect } },
    });
  }

  async remove(
    projectId: string,
    targetUserId: string,
    actorUserId: string,
  ): Promise<ProjectMemberResponseDto> {
    const actor = await this.prisma.projectMember.findUnique({
      where: {
        userId_projectId: { userId: actorUserId, projectId },
      },
    });

    if (!actor) {
      throw new NotFoundException('Project not found');
    }

    const membership = await this.prisma.projectMember.findUnique({
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
      await this.assertNotLastOwner(projectId);
    }

    return this.prisma.projectMember.delete({
      where: { id: membership.id },
      include: { user: { select: memberUserSelect } },
    });
  }

  private async assertNotLastOwner(projectId: string) {
    const ownerCount = await this.prisma.projectMember.count({
      where: { projectId, role: Role.OWNER },
    });

    if (ownerCount <= 1) {
      throw new ForbiddenException(
        'Cannot remove or demote the last OWNER of the project',
      );
    }
  }
}
