import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectMemberGuard } from '../common/authorization/project-member.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ProjectScope } from '../common/decorators/project-scope.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../generated/prisma/enums';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
} from '@nestjs/swagger';
import { ProjectResponseDto } from './dto/project-response.dto';
import {
  PaginatedResponseDto,
  PaginationQueryDto,
} from '../common/dto/pagination.dto';

export class PaginatedProjectResponseDto extends PaginatedResponseDto<ProjectResponseDto> {
  @ApiProperty({ type: () => ProjectResponseDto, isArray: true })
  declare data: ProjectResponseDto[];
}

@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('projects')
export class ProjectsController {
  constructor(private projectsService: ProjectsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new project' })
  create(@Body() dto: CreateProjectDto, @CurrentUser('userId') userId: string) {
    return this.projectsService.create(dto, userId);
  }

  @ApiOkResponse({ type: PaginatedProjectResponseDto })
  @Get()
  @ApiOperation({
    summary: 'Retrieve a paginated list of projects',
    description:
      'Each project lists its first 20 members plus `memberCount`; use /projects/:id/members for the full list.',
  })
  findAll(
    @CurrentUser('userId') userId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.projectsService.findAll(userId, query);
  }

  @Get(':id')
  @UseGuards(ProjectMemberGuard)
  @ProjectScope('project', 'id')
  @ApiOperation({ summary: 'Retrieve a single project' })
  findOne(@Param('id') id: string) {
    return this.projectsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(ProjectMemberGuard)
  @ProjectScope('project', 'id')
  @Roles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Update a project by ID' })
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(ProjectMemberGuard)
  @ProjectScope('project', 'id')
  @Roles(Role.OWNER)
  @ApiOperation({ summary: 'Delete a project by ID (soft delete)' })
  softDelete(@Param('id') id: string) {
    return this.projectsService.softDelete(id);
  }
}
