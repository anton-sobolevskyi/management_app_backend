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

  /**
   * Ensures the user is a member of the project.
   * Optionally requires one of the given roles.
   * Returns the membership for further checks.
   * Non-members receive 404 (not 403) to avoid leaking project existence.
   */
  async assertProjectMember(
    userId: string,
    projectId: string,
    allowedRoles?: Role[],
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const membership = await this.prisma.projectMember.findUnique({
      where: {
        userId_projectId: { userId, projectId },
      },
    });

    if (!membership) {
      throw new NotFoundException('Project not found');
    }

    if (allowedRoles?.length && !allowedRoles.includes(membership.role)) {
      throw new ForbiddenException(
        `Requires one of roles: ${allowedRoles.join(', ')}`,
      );
    }

    return membership;
  }

  /** Resolve project from a task, then assert membership */
  async assertTaskAccess(
    userId: string,
    taskId: string,
    allowedRoles?: Role[],
  ) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: { id: true, projectId: true },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    await this.assertProjectMember(userId, task.projectId, allowedRoles);
    return task;
  }

  /** Resolve project from comment → task, then assert membership */
  async assertCommentAccess(
    userId: string,
    commentId: string,
    allowedRoles?: Role[],
  ) {
    const comment = await this.prisma.comment.findFirst({
      where: { id: commentId, deletedAt: null },
      select: {
        id: true,
        authorId: true,
        task: { select: { projectId: true } },
      },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    await this.assertProjectMember(
      userId,
      comment.task.projectId,
      allowedRoles,
    );
    return comment;
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
    comment: { authorId: string; task: { projectId: string } },
  ) {
    if (comment.authorId === userId) {
      return;
    }

    const membership = await this.prisma.projectMember.findUnique({
      where: {
        userId_projectId: {
          userId,
          projectId: comment.task.projectId,
        },
      },
    });

    const isAdmin =
      membership?.role === Role.OWNER || membership?.role === Role.ADMIN;

    if (!isAdmin) {
      throw new ForbiddenException(
        'Only the author or a project admin can modify this comment',
      );
    }
  }
}
