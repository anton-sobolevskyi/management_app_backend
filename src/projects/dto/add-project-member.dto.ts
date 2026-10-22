import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, MaxLength } from 'class-validator';
import { Role } from '../../generated/prisma/enums';
import { NormalizeEmail } from '../../common/decorators/normalize-email.decorator';

export class AddProjectMemberDto {
  @ApiProperty({ example: 'alice@example.com' })
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({
    enum: Role,
    example: Role.MEMBER,
    required: false,
    default: Role.MEMBER,
  })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
