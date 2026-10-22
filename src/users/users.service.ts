import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { Role } from '../generated/prisma/enums';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { normalizeEmail } from '../common/utils/email';
import { getAppConfig } from '../config/app.config';

const userSelect = {
  id: true,
  email: true,
  name: true,
  avatarId: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private projectsService: ProjectsService,
    private attachmentsService: AttachmentsService,
  ) {}

  async findOne(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: userSelect,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    await this.findOne(id);

    const email = dto.email ? normalizeEmail(dto.email) : undefined;

    if (email) {
      const taken = await this.prisma.user.findFirst({
        where: {
          email,
          deletedAt: null,
          NOT: { id },
        },
      });
      if (taken) {
        throw new ConflictException('Email already in use');
      }
    }

    return this.prisma.user.update({
      where: { id },
      data: { ...dto, email },
      select: userSelect,
    });
  }

  /**
   * Change the password and end every session: all refresh tokens are revoked,
   * so other devices (and anyone holding a stolen token) must log in again.
   * Access tokens already issued stay valid until they expire.
   */
  async changePassword(id: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const matches = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );

    if (!matches) {
      throw new BadRequestException('Current password is incorrect');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'New password must differ from the current one',
      );
    }

    const passwordHash = await bcrypt.hash(
      dto.newPassword,
      getAppConfig().bcryptRounds,
    );

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({
        where: { userId: id, revoked: false },
        data: { revoked: true },
      }),
    ]);
  }

  /**
   * Soft-delete the account.
   *
   * - Refused while the user is the only OWNER of a project that still has
   *   other members (it would be left with nobody able to manage it): they
   *   must transfer ownership or remove the others first.
   * - Projects where the user is the only member are deleted with the account.
   * - Memberships are removed and the user's tasks are unassigned.
   * - Personal data is erased: name, password hash, avatar and email are
   *   replaced (the email is freed for re-registration).
   * - All refresh tokens are revoked.
   */
  async softDelete(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const owned = await this.prisma.projectMember.findMany({
      where: { userId: id, role: Role.OWNER, project: { deletedAt: null } },
      select: { projectId: true, project: { select: { name: true } } },
    });

    const blocking: string[] = [];
    const soloProjectIds: string[] = [];

    for (const { projectId, project } of owned) {
      const [otherOwners, otherMembers] = await Promise.all([
        this.prisma.projectMember.count({
          where: { projectId, role: Role.OWNER, userId: { not: id } },
        }),
        this.prisma.projectMember.count({
          where: { projectId, userId: { not: id } },
        }),
      ]);

      if (otherOwners > 0) continue; // someone else keeps it running

      if (otherMembers > 0) {
        blocking.push(project.name);
      } else {
        soloProjectIds.push(projectId);
      }
    }

    if (blocking.length > 0) {
      throw new ConflictException(
        `Transfer ownership or remove the other members before deleting your account. Projects: ${blocking.join(', ')}`,
      );
    }

    for (const projectId of soloProjectIds) {
      await this.projectsService.softDelete(projectId);
    }

    const avatarId = user.avatarId;

    const deleted = await this.prisma.$transaction(async (tx) => {
      await tx.task.updateMany({
        where: { assignedToId: id },
        data: { assignedToId: null },
      });
      await tx.projectMember.deleteMany({ where: { userId: id } });
      await tx.refreshToken.updateMany({
        where: { userId: id, revoked: false },
        data: { revoked: true },
      });

      return tx.user.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          email: `deleted+${id}+${Date.now()}@deleted.local`,
          name: 'Deleted user',
          // Not a valid bcrypt hash: no password can ever match it
          passwordHash: `!${randomUUID()}`,
          avatarId: null,
        },
        select: userSelect,
      });
    });

    if (avatarId) {
      await this.attachmentsService.remove(avatarId).catch(() => undefined);
    }

    return deleted;
  }

  async getMe(userId: string): Promise<UserResponseDto> {
    return this.findOne(userId);
  }
}
