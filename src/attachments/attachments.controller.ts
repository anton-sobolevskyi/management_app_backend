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
import { ApiOperation } from '@nestjs/swagger';

@UseGuards(JwtAuthGuard)
@Controller()
export class AttachmentsController {
  constructor(private attachmentsService: AttachmentsService) { }

  @ApiOperation({ summary: 'Upload an attachment for a task' })
  @Post('tasks/:taskId/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadForTask(
    @Param('taskId') taskId: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: Express.Request,
  ) {
    const user = req.user;

    if (!user) {
      throw new UnauthorizedException('User not authenticated');
    }

    return this.attachmentsService.uploadForTask(taskId, file, user['userId']);
  }

  @ApiOperation({ summary: 'Upload an attachment for a comment' })
  @Post('comments/:commentId/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadForComment(
    @Param('commentId') commentId: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: Express.Request,
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

  @ApiOperation({ summary: 'Upload an avatar for the authenticated user' })
  @Post('users/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: Express.Request,
  ) {
    const user = req.user;

    if (!user) {
      throw new UnauthorizedException('User not authenticated');
    }

    return this.attachmentsService.uploadAvatar(user['userId'], file);
  }

  @ApiOperation({ summary: 'Get all attachments for a task' })
  @Get('tasks/:taskId/attachments')
  findAllForTask(@Param('taskId') taskId: string) {
    return this.attachmentsService.findAllForTask(taskId);
  }

  @ApiOperation({ summary: 'Get download URL for an attachment' })
  @Get('attachments/:id/download')
  getDownloadUrl(@Param('id') id: string) {
    return this.attachmentsService.getDownloadUrl(id);
  }

  @ApiOperation({ summary: 'Delete an attachment by ID' })
  @Delete('attachments/:id')
  remove(@Param('id') id: string) {
    return this.attachmentsService.remove(id);
  }
}
