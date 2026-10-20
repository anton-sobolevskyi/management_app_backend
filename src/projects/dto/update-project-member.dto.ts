import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { Role } from '../../generated/prisma/enums';

export class UpdateProjectMemberDto {
  @ApiProperty({ enum: Role, example: Role.ADMIN })
  @IsEnum(Role)
  role: Role;
}
