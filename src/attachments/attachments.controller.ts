import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AttachmentsService } from './attachments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { Request as ExpressRequest } from 'express';

@UseGuards(JwtAuthGuard)
@Controller()
export class AttachmentsController {
  constructor(private attachmentsService: AttachmentsService) {}

  @Post('tasks/:taskId/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadForTask(
    @Param('taskId') taskId: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: ExpressRequest,
  ) {
    const user = req.user;

    if (!user) {
      throw new UnauthorizedException('User not authenticated');
    }

    return this.attachmentsService.uploadForTask(taskId, file, user['userId']);
  }

  @Post('comments/:commentId/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadForComment(
    @Param('commentId') commentId: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: ExpressRequest,
  ) {
    const user = req.user;

    if (!user) {
      throw new UnauthorizedException('User not authenticated');
    }

    return this.attachmentsService.uploadForComment(
      commentId,
      file,
      user['userId'],
    );
  }

  @Post('users/me/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: ExpressRequest,
  ) {
    const user = req.user;

    if (!user) {
      throw new UnauthorizedException('User not authenticated');
    }

    return this.attachmentsService.uploadAvatar(user['userId'], file);
  }

  @Get('tasks/:taskId/attachments')
  findAllForTask(@Param('taskId') taskId: string) {
    return this.attachmentsService.findAllForTask(taskId);
  }

  @Get('attachments/:id/download')
  getDownloadUrl(@Param('id') id: string) {
    return this.attachmentsService.getDownloadUrl(id);
  }

  @Delete('attachments/:id')
  remove(@Param('id') id: string) {
    return this.attachmentsService.remove(id);
  }
}
