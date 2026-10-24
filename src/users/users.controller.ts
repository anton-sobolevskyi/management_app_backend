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
import { DeleteAccountDto } from './dto/delete-account.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  SimpleThrottlerGuard,
  Throttle,
} from '../common/throttler/simple-throttler.guard';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

/** Routes that verify the password: slow to brute-force from a stolen token. */
const PASSWORD_CHECK_LIMIT = { limit: 5, windowMs: 60_000 };

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
  @Throttle({ limit: 10, windowMs: 60_000 })
  @ApiOperation({
    summary: 'Update current user profile',
    description:
      'Changing `email` requires `currentPassword`, makes the address unverified again, notifies the old address and mails a confirmation link to the new one.',
  })
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
  @Throttle(PASSWORD_CHECK_LIMIT)
  @ApiOperation({
    summary: 'Soft-delete current user account',
    description:
      'Requires `currentPassword` in the body. Fails with 409 while you are the only OWNER of a project that has other members. Projects where you are the only member are deleted with the account.',
  })
  deleteMe(
    @CurrentUser('userId') userId: string,
    @Body() dto: DeleteAccountDto,
  ) {
    return this.usersService.softDelete(userId, dto);
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
  @Throttle({ limit: 10, windowMs: 60_000 })
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
  @Throttle(PASSWORD_CHECK_LIMIT)
  @ApiOperation({
    summary: 'Soft-delete own account by id (self only)',
    deprecated: true,
    description: 'Deprecated: use DELETE /users/me.',
  })
  softDelete(
    @Param('id') id: string,
    @Body() dto: DeleteAccountDto,
    @CurrentUser('userId') userId: string,
  ) {
    this.assertSelf(userId, id);
    return this.usersService.softDelete(id, dto);
  }

  private assertSelf(actorId: string, targetId: string) {
    if (actorId !== targetId) {
      throw new ForbiddenException('You can only access your own user account');
    }
  }
}
