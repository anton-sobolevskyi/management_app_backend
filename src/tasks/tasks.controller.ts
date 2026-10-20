import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectMemberGuard } from '../common/authorization/project-member.guard';
import type { Request as ExpressRequest } from 'express';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PaginationQueryDto } from '../common/dto/pagination.dto';

@ApiTags('project tasks')
@UseGuards(JwtAuthGuard, ProjectMemberGuard)
@ApiBearerAuth('access-token')
@Controller('projects/:projectId/tasks')
export class TasksController {
  constructor(private tasksService: TasksService) {}

  @ApiOperation({ summary: 'Create a new task in a project' })
  @Post()
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateTaskDto,
    @Request() req: ExpressRequest,
  ) {
    return this.tasksService.create(projectId, dto, req.user!['userId']);
  }

  @ApiOperation({
    summary: 'Get paginated tasks in a project',
    description:
      'Supports filters: status, assignedToId, q (title/description search), dueBefore, dueAfter',
  })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'assignedToId', required: false })
  @ApiQuery({ name: 'dueBefore', required: false })
  @ApiQuery({ name: 'dueAfter', required: false })
  @Get()
  findAll(
    @Param('projectId') projectId: string,
    @Query() query: PaginationQueryDto,
    @Query('status') status?: string,
    @Query('assignedToId') assignedToId?: string,
    @Query('q') q?: string,
    @Query('dueBefore') dueBefore?: string,
    @Query('dueAfter') dueAfter?: string,
  ) {
    return this.tasksService.findAll(
      projectId,
      { status, assignedToId, q, dueBefore, dueAfter },
      query,
    );
  }
}
