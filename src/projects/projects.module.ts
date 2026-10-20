import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { ProjectMembersService } from './project-members.service';
import { ProjectMembersController } from './project-members.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AttachmentsModule } from '../attachments/attachments.module';

@Module({
  imports: [PrismaModule, AttachmentsModule],
  providers: [ProjectsService, ProjectMembersService],
  controllers: [ProjectsController, ProjectMembersController],
  exports: [ProjectsService, ProjectMembersService],
})
export class ProjectsModule {}
