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
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectMemberGuard } from '../common/authorization/project-member.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../generated/prisma/enums';
import type { Request as ExpressRequest } from 'express';
import { ApiBearerAuth, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { ProjectResponseDto } from './dto/project-response.dto';

@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('projects')
export class ProjectsController {
  constructor(private projectsService: ProjectsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new project' })
  create(@Body() dto: CreateProjectDto, @Request() req: ExpressRequest) {
    return this.projectsService.create(dto, req.user!['userId']);
  }

  @ApiOkResponse({ type: [ProjectResponseDto] })
  @Get()
  @ApiOperation({ summary: 'Retrieve a list of all projects' })
  findAll(@Request() req: ExpressRequest) {
    return this.projectsService.findAll(req.user!['userId']);
  }

  @Get(':id')
  @UseGuards(ProjectMemberGuard)
  @ApiOperation({ summary: 'Retrieve a single project' })
  findOne(@Param('id') id: string) {
    return this.projectsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(ProjectMemberGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: 'Update a project by ID' })
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(ProjectMemberGuard)
  @Roles(Role.OWNER)
  @ApiOperation({ summary: 'Delete a project by ID (soft delete)' })
  softDelete(@Param('id') id: string) {
    return this.projectsService.softDelete(id);
  }
}
