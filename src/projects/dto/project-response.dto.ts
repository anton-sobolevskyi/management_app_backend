import { ApiProperty } from '@nestjs/swagger';
import { ProjectMemberResponseDto } from './project-member-response.dto';

export class ProjectResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'Website Redesign' })
  name: string;

  @ApiProperty({ required: false, nullable: true })
  description: string | null;

  @ApiProperty({ required: false, type: () => [ProjectMemberResponseDto] })
  members?: ProjectMemberResponseDto[];

  @ApiProperty({
    required: false,
    description:
      'Total members (list endpoint only; `members` is capped at 20 there)',
  })
  memberCount?: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ required: false, nullable: true })
  deletedAt: Date | null;
}
