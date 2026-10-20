import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ProjectMembersService } from './project-members.service';
import { AddProjectMemberDto } from './dto/add-project-member.dto';
import { UpdateProjectMemberDto } from './dto/update-project-member.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectMemberGuard } from '../common/authorization/project-member.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../generated/prisma/enums';
import type { Request as ExpressRequest } from 'express';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ProjectMemberResponseDto } from './dto/project-member-response.dto';

@ApiTags('project members')
@UseGuards(JwtAuthGuard, ProjectMemberGuard)
@ApiBearerAuth('access-token')
@Controller('projects/:projectId/members')
export class ProjectMembersController {
  constructor(private membersService: ProjectMembersService) {}

  @Get()
  @ApiOperation({ summary: 'List project members' })
  @ApiOkResponse({ type: [ProjectMemberResponseDto] })
  findAll(@Param('projectId') projectId: string) {
    return this.membersService.findAll(projectId);
  }

  @Post()
  @Roles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Add a member by email' })
  @ApiOkResponse({ type: ProjectMemberResponseDto })
  add(
    @Param('projectId') projectId: string,
    @Body() dto: AddProjectMemberDto,
  ) {
    return this.membersService.add(projectId, dto);
  }

  @Patch(':userId')
  @Roles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Update a member role' })
  @ApiOkResponse({ type: ProjectMemberResponseDto })
  updateRole(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateProjectMemberDto,
  ) {
    return this.membersService.updateRole(projectId, userId, dto);
  }

  @Delete(':userId')
  @Roles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Remove a project member' })
  @ApiOkResponse({ type: ProjectMemberResponseDto })
  remove(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Request() req: ExpressRequest,
  ) {
    return this.membersService.remove(
      projectId,
      userId,
      req.user!['userId'],
    );
  }
}
