import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectMemberGuard } from '../common/authorization/project-member.guard';
import { ProjectScope } from '../common/decorators/project-scope.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { TaskQueryDto } from './dto/task-query.dto';
import { TaskResponseDto } from './dto/task-response.dto';
import {
  PaginatedResponseDto,
  PaginatedResponseDtoFor,
} from '../common/dto/pagination.dto';

@ApiTags('project tasks')
@UseGuards(JwtAuthGuard, ProjectMemberGuard)
@ApiBearerAuth('access-token')
@ProjectScope('project', 'projectId')
@Controller('projects/:projectId/tasks')
export class TasksController {
  constructor(private tasksService: TasksService) {}

  @ApiOperation({ summary: 'Create a new task in a project' })
  @Post()
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateTaskDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.tasksService.create(projectId, dto, userId);
  }

  @ApiOkResponse({ type: PaginatedResponseDtoFor(TaskResponseDto) })
  @ApiOperation({
    summary: 'Get paginated tasks in a project',
    description:
      'Supports filters: status, assignedToId, q (title/description search), dueBefore, dueAfter',
  })
  @Get()
  findAll(@Param('projectId') projectId: string, @Query() query: TaskQueryDto) {
    const { status, assignedToId, q, dueBefore, dueAfter, ...pagination } =
      query;
    return this.tasksService.findAll(
      projectId,
      { status, assignedToId, q, dueBefore, dueAfter },
      pagination,
    );
  }
}
