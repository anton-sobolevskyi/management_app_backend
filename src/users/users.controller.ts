import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  SimpleThrottlerGuard,
  Throttle,
} from '../common/throttler/simple-throttler.guard';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@UseGuards(JwtAuthGuard, SimpleThrottlerGuard)
@ApiBearerAuth('access-token')
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  getMe(@CurrentUser('userId') userId: string) {
    return this.usersService.getMe(userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  updateMe(@CurrentUser('userId') userId: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(userId, dto);
  }

  @Patch('me/password')
  @Throttle({ limit: 5, windowMs: 60_000 })
  @HttpCode(204)
  @ApiOperation({
    summary: 'Change password',
    description:
      'Verifies the current password, sets the new one and revokes all refresh tokens (every device must log in again once its access token expires).',
  })
  changePassword(
    @CurrentUser('userId') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(userId, dto);
  }

  @Delete('me')
  @ApiOperation({
    summary: 'Soft-delete current user account',
    description:
      'Fails with 409 while you are the only OWNER of a project that has other members. Projects where you are the only member are deleted with the account.',
  })
  deleteMe(@CurrentUser('userId') userId: string) {
    return this.usersService.softDelete(userId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get own user profile by id (self only)',
    deprecated: true,
    description: 'Deprecated: use GET /users/me.',
  })
  findOne(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    this.assertSelf(userId, id);
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update own user profile by id (self only)',
    deprecated: true,
    description: 'Deprecated: use PATCH /users/me.',
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser('userId') userId: string,
  ) {
    this.assertSelf(userId, id);
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Soft-delete own account by id (self only)',
    deprecated: true,
    description: 'Deprecated: use DELETE /users/me.',
  })
  softDelete(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    this.assertSelf(userId, id);
    return this.usersService.softDelete(id);
  }

  private assertSelf(actorId: string, targetId: string) {
    if (actorId !== targetId) {
      throw new ForbiddenException('You can only access your own user account');
    }
  }
}
