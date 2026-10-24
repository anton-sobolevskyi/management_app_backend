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
import { ProjectMembersService } from './project-members.service';
import { AddProjectMemberDto } from './dto/add-project-member.dto';
import { UpdateProjectMemberDto } from './dto/update-project-member.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectMemberGuard } from '../common/authorization/project-member.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../generated/prisma/enums';
import {
  SimpleThrottlerGuard,
  Throttle,
} from '../common/throttler/simple-throttler.guard';
import { ProjectScope } from '../common/decorators/project-scope.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { ProjectMemberResponseDto } from './dto/project-member-response.dto';
import {
  PaginatedResponseDto,
  PaginationQueryDto,
} from '../common/dto/pagination.dto';

export class PaginatedProjectMemberResponseDto extends PaginatedResponseDto<ProjectMemberResponseDto> {
  @ApiProperty({ type: () => ProjectMemberResponseDto, isArray: true })
  declare data: ProjectMemberResponseDto[];
}

@ApiTags('project members')
@UseGuards(JwtAuthGuard, ProjectMemberGuard, SimpleThrottlerGuard)
@ApiBearerAuth('access-token')
@ProjectScope('project', 'projectId')
@Controller('projects/:projectId/members')
export class ProjectMembersController {
  constructor(private membersService: ProjectMembersService) {}

  @Get()
  @ApiOperation({ summary: 'List project members (paginated)' })
  @ApiOkResponse({ type: PaginatedProjectMemberResponseDto })
  findAll(
    @Param('projectId') projectId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.membersService.findAll(projectId, query);
  }

  @Post()
  @Throttle({ limit: 30, windowMs: 60_000 })
  @Roles(Role.OWNER, Role.ADMIN)
  @ApiOperation({
    summary: 'Add a member by email',
    description:
      'Both you and the invited person need a verified e-mail address. An unverified or unknown address answers 404 "User not found".',
  })
  @ApiOkResponse({ type: ProjectMemberResponseDto })
  add(
    @Param('projectId') projectId: string,
    @Body() dto: AddProjectMemberDto,
    @CurrentUser('userId') actorId: string,
  ) {
    return this.membersService.add(projectId, dto, actorId);
  }

  @Patch(':userId')
  @Roles(Role.OWNER, Role.ADMIN)
  @ApiOperation({
    summary: 'Update a member role (OWNER required to change OWNER)',
  })
  @ApiOkResponse({ type: ProjectMemberResponseDto })
  updateRole(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateProjectMemberDto,
    @CurrentUser('userId') actorId: string,
  ) {
    return this.membersService.updateRole(projectId, userId, dto, actorId);
  }

  @Post(':userId/transfer-ownership')
  @Roles(Role.OWNER)
  @ApiOperation({
    summary: 'Transfer project ownership (previous OWNER becomes ADMIN)',
  })
  @ApiOkResponse({ type: ProjectMemberResponseDto })
  transferOwnership(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @CurrentUser('userId') actorId: string,
  ) {
    return this.membersService.transferOwnership(projectId, userId, actorId);
  }

  @Delete(':userId')
  @ApiOperation({
    summary:
      'Remove a member, or leave the project (self). Removing others requires OWNER/ADMIN.',
  })
  @ApiOkResponse({ type: ProjectMemberResponseDto })
  remove(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @CurrentUser('userId') actorId: string,
  ) {
    return this.membersService.remove(projectId, userId, actorId);
  }
}
