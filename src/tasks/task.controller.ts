import {
  Body,
  Controller,
  Get,
  Param,
  UseGuards,
  Patch,
  Delete,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { UpdateTaskDto } from './dto/update-task.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectMemberGuard } from '../common/authorization/project-member.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ProjectScope } from '../common/decorators/project-scope.decorator';
import { Role } from '../generated/prisma/enums';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TaskResponseDto } from './dto/task-response.dto';

@ApiTags('tasks')
@UseGuards(JwtAuthGuard, ProjectMemberGuard)
@ApiBearerAuth('access-token')
@ProjectScope('task', 'id')
@Controller('tasks')
export class TaskController {
  constructor(private tasksService: TasksService) {}

  @ApiOperation({ summary: 'Get a task by ID' })
  @ApiResponse({ status: 200, type: TaskResponseDto })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tasksService.findOne(id);
  }

  @ApiOperation({ summary: 'Update a task' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.tasksService.update(id, dto);
  }

  @ApiOperation({ summary: 'Soft delete a task' })
  @ApiResponse({ status: 200, type: TaskResponseDto })
  @Roles(Role.OWNER, Role.ADMIN)
  @Delete(':id')
  softDelete(@Param('id') id: string) {
    return this.tasksService.softDelete(id);
  }
}
