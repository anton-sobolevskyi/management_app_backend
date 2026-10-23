import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '../../generated/prisma/enums';

@Injectable()
export class AuthorizationService {
  constructor(private prisma: PrismaService) {}

  private checkRoles(role: Role, allowedRoles?: Role[]) {
    if (allowedRoles?.length && !allowedRoles.includes(role)) {
      throw new ForbiddenException(
        `Requires one of roles: ${allowedRoles.join(', ')}`,
      );
    }
  }

  /**
   * Ensures the user is a member of the (live) project, with ONE query.
   * Optionally requires one of the given roles.
   * Returns the membership for further checks.
   * Non-members receive 404 (not 403) to avoid leaking project existence.
   */
  async assertProjectMember(
    userId: string,
    projectId: string,
    allowedRoles?: Role[],
  ) {
    const membership = await this.prisma.projectMember.findFirst({
      where: { userId, projectId, project: { deletedAt: null } },
    });

    if (!membership) {
      throw new NotFoundException('Project not found');
    }

    this.checkRoles(membership.role, allowedRoles);
    return membership;
  }

  /**
   * Resolve project from a task and assert membership, with ONE query.
   * A missing task and a task in a project the user can't see look the same (404).
   */
  async assertTaskAccess(
    userId: string,
    taskId: string,
    allowedRoles?: Role[],
  ) {
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        deletedAt: null,
        project: { deletedAt: null, members: { some: { userId } } },
      },
      select: {
        id: true,
        projectId: true,
        project: {
          select: {
            members: { where: { userId }, select: { role: true }, take: 1 },
          },
        },
      },
    });

    const role = task?.project.members[0]?.role;
    if (!task || !role) {
      throw new NotFoundException('Task not found');
    }

    this.checkRoles(role, allowedRoles);
    return { id: task.id, projectId: task.projectId };
  }

  /**
   * Resolve project from comment → task and assert membership, with ONE query.
   * The caller's role is returned so author/admin checks need no extra query.
   */
  async assertCommentAccess(
    userId: string,
    commentId: string,
    allowedRoles?: Role[],
  ) {
    const comment = await this.prisma.comment.findFirst({
      where: {
        id: commentId,
        deletedAt: null,
        task: { project: { deletedAt: null, members: { some: { userId } } } },
      },
      select: {
        id: true,
        authorId: true,
        task: {
          select: {
            projectId: true,
            project: {
              select: {
                members: {
                  where: { userId },
                  select: { role: true },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    const role = comment?.task.project.members[0]?.role;
    if (!comment || !role) {
      throw new NotFoundException('Comment not found');
    }

    this.checkRoles(role, allowedRoles);
    return {
      id: comment.id,
      authorId: comment.authorId,
      task: { projectId: comment.task.projectId },
      role,
    };
  }

  /**
   * Resolve project from attachment (task or comment), then assert membership.
   *
   * Avatars belong to no project. They are readable by their owner and by
   * anyone who shares at least one live project with the owner (otherwise
   * members could never see each other's avatars); everyone else gets 404.
   */
  async assertAttachmentAccess(
    userId: string,
    attachmentId: string,
    allowedRoles?: Role[],
  ) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      select: {
        id: true,
        uploadedById: true,
        taskId: true,
        commentId: true,
        task: { select: { projectId: true } },
        comment: { select: { task: { select: { projectId: true } } } },
      },
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    const projectId =
      attachment.task?.projectId ?? attachment.comment?.task?.projectId;

    if (!projectId) {
      if (attachment.uploadedById !== userId) {
        const sharesProject = await this.prisma.projectMember.findFirst({
          where: {
            userId,
            project: {
              deletedAt: null,
              members: { some: { userId: attachment.uploadedById } },
            },
          },
          select: { id: true },
        });

        if (!sharesProject) {
          throw new NotFoundException('Attachment not found');
        }
      }
      return { ...attachment, projectId: undefined };
    }

    await this.assertProjectMember(userId, projectId, allowedRoles);
    return { ...attachment, projectId };
  }

  /**
   * Attachment mutation rule: the uploader OR a project OWNER/ADMIN.
   * Avatars (no project) can only be changed by their owner.
   * Call after assertAttachmentAccess (read access already verified).
   */
  async assertAttachmentManage(
    userId: string,
    attachment: { uploadedById: string; projectId?: string },
  ) {
    if (attachment.uploadedById === userId) {
      return;
    }

    if (!attachment.projectId) {
      throw new ForbiddenException('You can only modify your own avatar');
    }

    const membership = await this.prisma.projectMember.findUnique({
      where: {
        userId_projectId: { userId, projectId: attachment.projectId },
      },
    });

    const isAdmin =
      membership?.role === Role.OWNER || membership?.role === Role.ADMIN;

    if (!isAdmin) {
      throw new ForbiddenException(
        'Only the uploader or a project admin can modify this attachment',
      );
    }
  }

  /**
   * Comment mutation rule: author OR project OWNER/ADMIN.
   * Call after assertCommentAccess (membership already verified).
   */
  async assertCommentAuthorOrAdmin(
    userId: string,
    comment: { authorId: string; task: { projectId: string }; role?: Role },
  ) {
    if (comment.authorId === userId) {
      return;
    }

    // assertCommentAccess already fetched the role; only look it up otherwise
    const role =
      comment.role ??
      (
        await this.prisma.projectMember.findUnique({
          where: {
            userId_projectId: {
              userId,
              projectId: comment.task.projectId,
            },
          },
        })
      )?.role;

    if (role !== Role.OWNER && role !== Role.ADMIN) {
      throw new ForbiddenException(
        'Only the author or a project admin can modify this comment',
      );
    }
  }
}
