import { Module } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { TaskCommentsController } from './task-comments.controller';
import { CommentsController } from './comments.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AttachmentsModule } from '../attachments/attachments.module';

@Module({
  imports: [PrismaModule, AttachmentsModule],
  providers: [CommentsService],
  controllers: [TaskCommentsController, CommentsController],
  exports: [CommentsService],
})
export class CommentsModule {}
