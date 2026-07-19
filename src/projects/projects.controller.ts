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
import { ApiOkResponse } from '@nestjs/swagger';
import { ProjectResponseDto } from './dto/project-response.dto';

@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private projectsService: ProjectsService) {}

  @Post()
  create(@Body() dto: CreateProjectDto, @Request() req: ExpressRequest) {
    return this.projectsService.create(dto, req.user!['userId']);
  }

  @ApiOkResponse({ type: [ProjectResponseDto] })
  @Get()
  findAll(@Request() req: ExpressRequest) {
    return this.projectsService.findAll(req.user!['userId']);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.projectsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(id, dto);
  }

  @Delete(':id')
  softDelete(@Param('id') id: string) {
    return this.projectsService.softDelete(id);
  }
}
