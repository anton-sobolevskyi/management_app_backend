import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { TaskController } from './task.controller';

@Module({
  providers: [TasksService],
  controllers: [TasksController, TaskController],
  exports: [TasksService],
})
export class TasksModule {}
