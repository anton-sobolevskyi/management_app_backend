import { SetMetadata } from '@nestjs/common';
import { Role } from '../../generated/prisma/enums';

export const ROLES_KEY = 'roles';

/** Require at least one of these project roles */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
