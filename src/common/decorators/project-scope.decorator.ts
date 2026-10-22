import { SetMetadata } from '@nestjs/common';

export const PROJECT_SCOPE_KEY = 'projectScope';

export type ScopeResource = 'project' | 'task' | 'comment' | 'attachment';

export interface ProjectScopeMetadata {
  resource: ScopeResource;
  param: string;
}

/**
 * Declares which route parameter identifies the resource that
 * ProjectMemberGuard must authorize against, e.g.
 *
 *   @ProjectScope('task', 'taskId')   // /tasks/:taskId/comments
 *   @ProjectScope('project', 'id')    // /projects/:id
 *
 * Explicit on purpose: the guard fails closed when it is missing, instead of
 * guessing the resource from the URL.
 */
export const ProjectScope = (resource: ScopeResource, param = 'id') =>
  SetMetadata<string, ProjectScopeMetadata>(PROJECT_SCOPE_KEY, {
    resource,
    param,
  });
