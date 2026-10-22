import {
  ExecutionContext,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import type { Request } from 'express';

export interface AuthUser {
  userId: string;
  email: string;
}

/**
 * The authenticated user, typed. `@CurrentUser()` gives `{ userId, email }`,
 * `@CurrentUser('userId')` just the id. Replaces `req.user!['userId']`.
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const user = ctx.switchToHttp().getRequest<Request>().user;

    if (!user) {
      throw new UnauthorizedException('User not authenticated');
    }

    return field ? user[field] : user;
  },
);
