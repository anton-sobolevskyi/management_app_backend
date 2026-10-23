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
      'Total members. `members` is capped (20 in the list, 100 in the detail view); use GET /projects/:id/members to page through all of them',
  })
  memberCount?: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ required: false, nullable: true })
  deletedAt: Date | null;
}
