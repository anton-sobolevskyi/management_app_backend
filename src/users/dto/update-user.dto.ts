import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password'] as const),
) {
  @ApiPropertyOptional({
    description:
      'Required when `email` changes: a stolen access token alone must not be enough to move the account to another mailbox.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  currentPassword?: string;
}
