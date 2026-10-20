import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional } from 'class-validator';
import { Role } from '../../generated/prisma/enums';

export class AddProjectMemberDto {
  @ApiProperty({ example: 'alice@example.com' })
  @IsEmail()
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
