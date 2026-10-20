import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';

@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  getMe(@Request() req: ExpressRequest) {
    return this.usersService.getMe(req.user!['userId']);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  updateMe(@Request() req: ExpressRequest, @Body() dto: UpdateUserDto) {
    return this.usersService.update(req.user!['userId'], dto);
  }

  @Delete('me')
  @ApiOperation({ summary: 'Soft-delete current user account' })
  deleteMe(@Request() req: ExpressRequest) {
    return this.usersService.softDelete(req.user!['userId']);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get own user profile by id (self only)' })
  findOne(@Param('id') id: string, @Request() req: ExpressRequest) {
    this.assertSelf(req.user!['userId'], id);
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update own user profile by id (self only)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Request() req: ExpressRequest,
  ) {
    this.assertSelf(req.user!['userId'], id);
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete own account by id (self only)' })
  softDelete(@Param('id') id: string, @Request() req: ExpressRequest) {
    this.assertSelf(req.user!['userId'], id);
    return this.usersService.softDelete(id);
  }

  private assertSelf(actorId: string, targetId: string) {
    if (actorId !== targetId) {
      throw new ForbiddenException('You can only access your own user account');
    }
  }
}
