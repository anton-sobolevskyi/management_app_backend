import { Module } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CommentsController } from './comments.controller';
import { CommentController } from './comment.controller';

@Module({
  providers: [CommentsService],
  controllers: [CommentsController, CommentController],
  exports: [CommentsService],
})
export class CommentsModule {}
