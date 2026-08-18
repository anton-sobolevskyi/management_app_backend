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
import type { Request as ExpressRequest } from 'express';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { ProjectResponseDto } from './dto/project-response.dto';

@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private projectsService: ProjectsService) { }

  @Post()
  @ApiOperation({ summary: 'Create a new project' })
  create(@Body() dto: CreateProjectDto, @Request() req: ExpressRequest) {
    console.log('Creating project with DTO:', dto, 'for user:', req.user);
    return this.projectsService.create(dto, req.user!['userId']);
  }

  @ApiOkResponse({ type: [ProjectResponseDto] })
  @Get()
  @ApiOperation({ summary: 'Retrieve a list of all projects' })
  findAll(@Request() req: ExpressRequest) {
    return this.projectsService.findAll(req.user!['userId']);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve a single project' })
  findOne(@Param('id') id: string) {
    return this.projectsService.findOne(id);
  }

  @ApiOperation({ summary: 'Update a project by ID' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(id, dto);
  }

  @ApiOperation({ summary: 'Delete a project by ID (soft delete)' })
  @Delete(':id')
  softDelete(@Param('id') id: string) {
    return this.projectsService.softDelete(id);
  }
}
