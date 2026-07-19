import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/enums';
import { UserResponseDto } from '../../users/dto/user-response.dto';

export class ProjectMemberResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  projectId: string;

  @ApiProperty({ enum: Role, example: Role.MEMBER })
  role: Role;

  @ApiProperty({ required: false, type: () => UserResponseDto })
  user?: UserResponseDto;

  @ApiProperty()
  joinedAt: Date;
}
