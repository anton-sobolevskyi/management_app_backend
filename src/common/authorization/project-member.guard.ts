import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isUUID } from 'class-validator';
import type { Request } from 'express';
import { AuthorizationService } from './authorization.service';
import { ROLES_KEY } from '../decorators/roles.decorator';
import {
  PROJECT_SCOPE_KEY,
  ProjectScopeMetadata,
} from '../decorators/project-scope.decorator';
import { Role } from '../../generated/prisma/enums';

/**
 * Ensures the authenticated user is a member of the project that owns the
 * requested resource, optionally enforcing @Roles(...).
 *
 * Which resource a route refers to is declared with @ProjectScope(resource,
 * param). A route using this guard without it fails closed (500) rather than
 * being authorized by guesswork on the URL.
 */
@Injectable()
export class ProjectMemberGuard implements CanActivate {
  private readonly logger = new Logger(ProjectMemberGuard.name);

  constructor(
    private reflector: Reflector,
    private authz: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const userId = request.user?.userId;

    if (!userId) {
      throw new ForbiddenException();
    }

    const scope = this.reflector.getAllAndOverride<
      ProjectScopeMetadata | undefined
    >(PROJECT_SCOPE_KEY, [context.getHandler(), context.getClass()]);

    if (!scope) {
      this.logger.error(
        `${context.getClass().name}.${context.getHandler().name} uses ProjectMemberGuard without @ProjectScope()`,
      );
      throw new InternalServerErrorException();
    }

    const requiredRoles =
      this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? undefined;

    const resourceId = request.params[scope.param] as string | undefined;

    // ids are UUIDs: anything else can't exist, so skip the database entirely
    if (!resourceId || !isUUID(resourceId)) {
      throw new NotFoundException('Resource not found');
    }

    switch (scope.resource) {
      case 'project':
        await this.authz.assertProjectMember(userId, resourceId, requiredRoles);
        break;
      case 'task':
        await this.authz.assertTaskAccess(userId, resourceId, requiredRoles);
        break;
      case 'comment':
        await this.authz.assertCommentAccess(userId, resourceId, requiredRoles);
        break;
      case 'attachment':
        await this.authz.assertAttachmentAccess(
          userId,
          resourceId,
          requiredRoles,
        );
        break;
    }

    return true;
  }
}
