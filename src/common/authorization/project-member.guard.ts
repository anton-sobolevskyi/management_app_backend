import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthorizationService } from './authorization.service';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';

/**
 * Ensures the authenticated user is a member of the project that owns the
 * requested resource. Optionally enforces @Roles(...).
 *
 * Resolves the resource from route params in order of specificity:
 * commentId → taskId → projectId / id (context-dependent) → attachment id.
 */
@Injectable()
export class ProjectMemberGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private authz: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.user?.userId;

    if (!userId) {
      return false;
    }

    const requiredRoles =
      this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? undefined;

    const params = request.params as Record<string, string | undefined>;
    const path: string = request.route?.path ?? request.url ?? '';

    // Most specific first
    if (params.commentId) {
      await this.authz.assertCommentAccess(
        userId,
        params.commentId,
        requiredRoles,
      );
      return true;
    }

    if (params.taskId) {
      await this.authz.assertTaskAccess(userId, params.taskId, requiredRoles);
      return true;
    }

    // /comments/:id
    if (path.includes('comments') && params.id && !params.projectId) {
      await this.authz.assertCommentAccess(userId, params.id, requiredRoles);
      return true;
    }

    // /tasks/:id (standalone task routes)
    if (
      (path.includes('/tasks') || path.endsWith('tasks/:id')) &&
      params.id &&
      !params.projectId
    ) {
      await this.authz.assertTaskAccess(userId, params.id, requiredRoles);
      return true;
    }

    // /attachments/:id or /attachments/:id/download
    if (path.includes('attachments') && params.id) {
      await this.authz.assertAttachmentAccess(
        userId,
        params.id,
        requiredRoles,
      );
      return true;
    }

    // /projects/:id or /projects/:projectId/...
    const projectId = params.projectId ?? params.id;
    if (projectId) {
      await this.authz.assertProjectMember(userId, projectId, requiredRoles);
      return true;
    }

    throw new NotFoundException('Resource not found');
  }
}
