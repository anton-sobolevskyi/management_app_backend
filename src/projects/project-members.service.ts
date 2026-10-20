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

  async findAll(projectId: string): Promise<ProjectMemberResponseDto[]> {
    return this.prisma.projectMember.findMany({
      where: { projectId },
      include: { user: { select: memberUserSelect } },
      orderBy: { joinedAt: 'asc' },
    });
  }

  async add(
    projectId: string,
    dto: AddProjectMemberDto,
  ): Promise<ProjectMemberResponseDto> {
    const role = dto.role ?? Role.MEMBER;

    if (role === Role.OWNER) {
      throw new BadRequestException(
        'Cannot assign OWNER via invite; transfer ownership separately',
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
  ): Promise<ProjectMemberResponseDto> {
    const membership = await this.prisma.projectMember.findUnique({
      where: {
        userId_projectId: { userId: targetUserId, projectId },
      },
    });

    if (!membership) {
      throw new NotFoundException('Member not found');
    }

    if (membership.role === Role.OWNER && dto.role !== Role.OWNER) {
      await this.assertNotLastOwner(projectId);
    }

    if (dto.role === Role.OWNER && membership.role !== Role.OWNER) {
      // Promoting to OWNER is allowed for OWNER/ADMIN callers (guard),
      // but we keep at least one OWNER by not demoting others here.
    }

    return this.prisma.projectMember.update({
      where: { id: membership.id },
      data: { role: dto.role },
      include: { user: { select: memberUserSelect } },
    });
  }

  async remove(
    projectId: string,
    targetUserId: string,
    actorUserId: string,
  ): Promise<ProjectMemberResponseDto> {
    const membership = await this.prisma.projectMember.findUnique({
      where: {
        userId_projectId: { userId: targetUserId, projectId },
      },
    });

    if (!membership) {
      throw new NotFoundException('Member not found');
    }

    if (membership.role === Role.OWNER) {
      await this.assertNotLastOwner(projectId);
    }

    // Optional: prevent non-owners from removing themselves if you want;
    // self-leave is allowed for non-last OWNER.
    if (targetUserId === actorUserId && membership.role === Role.OWNER) {
      const ownerCount = await this.prisma.projectMember.count({
        where: { projectId, role: Role.OWNER },
      });
      if (ownerCount <= 1) {
        throw new ForbiddenException(
          'Cannot leave as the last OWNER; transfer ownership first',
        );
      }
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
