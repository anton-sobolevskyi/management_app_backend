import {
  UseGuards,
  Controller,
  Get,
  Param,
  Patch,
  Body,
  Delete,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectMemberGuard } from '../common/authorization/project-member.guard';
import { CommentsService } from './comments.service';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';

@UseGuards(JwtAuthGuard, ProjectMemberGuard)
@ApiBearerAuth('access-token')
@Controller('comments')
export class CommentController {
  constructor(private commentsService: CommentsService) {}

  @ApiOperation({ summary: 'Get a comment by ID' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.commentsService.findOne(id);
  }

  @ApiOperation({ summary: 'Update a comment by ID (author or project admin)' })
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCommentDto,
    @Request() req: ExpressRequest,
  ) {
    return this.commentsService.update(id, dto, req.user!['userId']);
  }

  @ApiOperation({
    summary: 'Soft delete a comment by ID (author or project admin)',
  })
  @Delete(':id')
  softDelete(@Param('id') id: string, @Request() req: ExpressRequest) {
    return this.commentsService.softDelete(id, req.user!['userId']);
  }
}
