import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MyTasksQueryDto } from './dto/my-tasks-query.dto';
import { PaginatedTaskResponseDto } from './project-tasks.controller';
import { TasksService } from './tasks.service';

@ApiTags('my tasks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('users/me/tasks')
export class MyTasksController {
  constructor(private tasksService: TasksService) {}

  @ApiOperation({
    summary: 'Tasks assigned to me across all my projects',
    description:
      'Excludes finished tasks unless includeDone=true. Soonest due date first, tasks without a due date last. Each task carries its project (id, name).',
  })
  @ApiOkResponse({ type: PaginatedTaskResponseDto })
  @Get()
  findMine(
    @CurrentUser('userId') userId: string,
    @Query() query: MyTasksQueryDto,
  ) {
    const { includeDone, ...pagination } = query;
    return this.tasksService.findAssignedTo(
      userId,
      { includeDone: includeDone === true },
      pagination,
    );
  }
}
