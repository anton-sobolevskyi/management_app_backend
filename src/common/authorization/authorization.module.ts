import { Global, Module } from '@nestjs/common';
import { AuthorizationService } from './authorization.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProjectMemberGuard } from './project-member.guard';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [AuthorizationService, ProjectMemberGuard],
  exports: [AuthorizationService, ProjectMemberGuard],
})
export class AuthorizationModule {}
