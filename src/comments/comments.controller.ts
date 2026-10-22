import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectMemberGuard } from '../common/authorization/project-member.guard';
import { ProjectScope } from '../common/decorators/project-scope.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import {
  PaginatedResponseDto,
  PaginatedResponseDtoFor,
  PaginationQueryDto,
} from '../common/dto/pagination.dto';
import { CommentResponseDto } from './dto/comment-response.dto';

@UseGuards(JwtAuthGuard, ProjectMemberGuard)
@ApiBearerAuth('access-token')
@ProjectScope('task', 'taskId')
@Controller('tasks/:taskId/comments')
export class CommentsController {
  constructor(private commentsService: CommentsService) {}

  @Post()
  create(
    @Param('taskId') taskId: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.commentsService.create(taskId, dto, userId);
  }

  @ApiOkResponse({ type: PaginatedResponseDtoFor(CommentResponseDto) })
  @Get()
  findAll(@Param('taskId') taskId: string, @Query() query: PaginationQueryDto) {
    return this.commentsService.findAll(taskId, query);
  }
}
