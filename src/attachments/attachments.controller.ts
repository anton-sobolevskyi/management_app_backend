import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AttachmentsService } from './attachments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectMemberGuard } from '../common/authorization/project-member.guard';
import { ProjectScope } from '../common/decorators/project-scope.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  SimpleThrottlerGuard,
  Throttle,
} from '../common/throttler/simple-throttler.guard';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UPLOAD_OPTIONS } from './attachments.constants';
import { UploadConcurrencyInterceptor } from './upload-concurrency.interceptor';

const UPLOAD_LIMIT = { limit: 30, windowMs: 60_000 };

@UseGuards(JwtAuthGuard, SimpleThrottlerGuard)
@ApiBearerAuth('access-token')
@Controller()
export class AttachmentsController {
  constructor(private attachmentsService: AttachmentsService) {}

  @ApiOperation({ summary: 'Upload an attachment for a task' })
  @Post('tasks/:taskId/attachments')
  @Throttle(UPLOAD_LIMIT)
  @UseGuards(ProjectMemberGuard)
  @ProjectScope('task', 'taskId')
  @UseInterceptors(
    UploadConcurrencyInterceptor,
    FileInterceptor('file', UPLOAD_OPTIONS),
  )
  uploadForTask(
    @Param('taskId') taskId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('userId') userId: string,
  ) {
    return this.attachmentsService.uploadForTask(taskId, file, userId);
  }

  @ApiOperation({
    summary: 'Upload an attachment for a comment (comment author or admin)',
  })
  @Post('comments/:commentId/attachments')
  @Throttle(UPLOAD_LIMIT)
  @UseGuards(ProjectMemberGuard)
  @ProjectScope('comment', 'commentId')
  @UseInterceptors(
    UploadConcurrencyInterceptor,
    FileInterceptor('file', UPLOAD_OPTIONS),
  )
  uploadForComment(
    @Param('commentId') commentId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('userId') userId: string,
  ) {
    return this.attachmentsService.uploadForComment(commentId, file, userId);
  }

  @ApiOperation({ summary: 'Upload an avatar for the authenticated user' })
  @Post('users/avatar')
  @Throttle(UPLOAD_LIMIT)
  @UseInterceptors(
    UploadConcurrencyInterceptor,
    FileInterceptor('file', UPLOAD_OPTIONS),
  )
  uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('userId') userId: string,
  ) {
    return this.attachmentsService.uploadAvatar(userId, file);
  }

  @ApiOperation({ summary: 'Get all attachments for a task' })
  @Get('tasks/:taskId/attachments')
  @UseGuards(ProjectMemberGuard)
  @ProjectScope('task', 'taskId')
  findAllForTask(@Param('taskId') taskId: string) {
    return this.attachmentsService.findAllForTask(taskId);
  }

  @ApiOperation({
    summary: 'Get download URL for an attachment',
    description:
      'Avatars are readable by their owner and by users who share a project with them.',
  })
  @Get('attachments/:id/download')
  @UseGuards(ProjectMemberGuard)
  @ProjectScope('attachment', 'id')
  getDownloadUrl(@Param('id') id: string) {
    return this.attachmentsService.getDownloadUrl(id);
  }

  @ApiOperation({
    summary: 'Delete an attachment (uploader or project admin)',
  })
  @Delete('attachments/:id')
  @UseGuards(ProjectMemberGuard)
  @ProjectScope('attachment', 'id')
  remove(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.attachmentsService.removeByUser(id, userId);
  }
}
