import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { ProjectTasksController } from './project-tasks.controller';
import { TasksController } from './tasks.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AttachmentsModule } from '../attachments/attachments.module';

@Module({
  imports: [PrismaModule, AttachmentsModule],
  providers: [TasksService],
  controllers: [ProjectTasksController, TasksController],
  exports: [TasksService],
})
export class TasksModule {}
