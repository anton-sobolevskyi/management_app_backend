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
import {
  AttachmentsService,
  StoredObject,
} from '../attachments/attachments.service';
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
   * Change the password and end every session: all refresh tokens are revoked
   * and the token version is bumped, so access tokens already issued stop
   * working immediately too (JwtStrategy compares the version).
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
      this.prisma.user.update({
        where: { id },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: id, revoked: false },
        data: { revoked: true, revokedAt: new Date() },
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
    // One transaction: the ownership checks, the deletion of solo projects and
    // the account wipe succeed or fail together, and the project rows stay
    // locked so nobody can change ownership between the check and the delete.
    const { deleted, avatarId, stored } = await this.prisma.$transaction(
      async (tx) => {
        const user = await tx.user.findFirst({
          where: { id, deletedAt: null },
        });

        if (!user) {
          throw new NotFoundException('User not found');
        }

        const owned = await tx.projectMember.findMany({
          where: { userId: id, role: Role.OWNER, project: { deletedAt: null } },
          select: { projectId: true, project: { select: { name: true } } },
        });
        const ownedIds = owned.map((o) => o.projectId);

        const blocking: string[] = [];
        const soloProjectIds: string[] = [];

        if (ownedIds.length > 0) {
          // Same lock transferOwnership / leave take on the project row
          await tx.$queryRaw`SELECT "id" FROM "projects" WHERE "id" = ANY(${ownedIds}::text[]) FOR UPDATE`;

          // One query for all owned projects instead of two counts each
          const others = await tx.projectMember.groupBy({
            by: ['projectId', 'role'],
            where: { projectId: { in: ownedIds }, userId: { not: id } },
            _count: { _all: true },
          });

          const members = new Map<string, number>();
          const owners = new Map<string, number>();
          for (const row of others) {
            members.set(
              row.projectId,
              (members.get(row.projectId) ?? 0) + row._count._all,
            );
            if (row.role === Role.OWNER) {
              owners.set(row.projectId, row._count._all);
            }
          }

          for (const { projectId, project } of owned) {
            if ((owners.get(projectId) ?? 0) > 0) continue; // someone else keeps it running

            if ((members.get(projectId) ?? 0) > 0) {
              blocking.push(project.name);
            } else {
              soloProjectIds.push(projectId);
            }
          }
        }

        if (blocking.length > 0) {
          throw new ConflictException(
            `Transfer ownership or remove the other members before deleting your account. Projects: ${blocking.join(', ')}`,
          );
        }

        const stored: StoredObject[] = [];
        for (const projectId of soloProjectIds) {
          const result = await this.projectsService.softDeleteInTx(
            tx,
            projectId,
          );
          stored.push(...result.stored);
        }

        await tx.task.updateMany({
          where: { assignedToId: id },
          data: { assignedToId: null },
        });
        await tx.projectMember.deleteMany({ where: { userId: id } });
        await tx.refreshToken.updateMany({
          where: { userId: id, revoked: false },
          data: { revoked: true, revokedAt: new Date() },
        });

        const deleted = await tx.user.update({
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

        return { deleted, avatarId: user.avatarId, stored };
      },
      { timeout: 20_000 },
    );

    // Files go only after the commit, so a rollback never orphans rows
    await this.attachmentsService.purgeObjects(stored);

    if (avatarId) {
      await this.attachmentsService.remove(avatarId).catch(() => undefined);
    }

    return deleted;
  }

  async getMe(userId: string): Promise<UserResponseDto> {
    return this.findOne(userId);
  }
}
