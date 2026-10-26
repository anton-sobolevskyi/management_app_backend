import { ApiProperty } from '@nestjs/swagger';
import { TaskStatus, Priority } from '../../generated/prisma/enums';
import { CommentResponseDto } from '../../comments/dto/comment-response.dto';
import { AttachmentResponseDto } from '../../attachments/dto/attachment-response.dto';

export class TaskProjectDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'Website Redesign' })
  name: string;
}

export class TaskResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'Design new homepage layout' })
  title: string;

  @ApiProperty({ required: false, nullable: true })
  description: string | null;

  @ApiProperty({ enum: TaskStatus, example: TaskStatus.TODO })
  status: TaskStatus;

  @ApiProperty({ enum: Priority, example: Priority.MEDIUM })
  priority: Priority;

  @ApiProperty({ required: false, nullable: true })
  dueDate: Date | null;

  @ApiProperty()
  projectId: string;

  @ApiProperty()
  createdById: string;

  @ApiProperty({ required: false, nullable: true })
  assignedToId: string | null;

  @ApiProperty({
    required: false,
    type: () => TaskProjectDto,
    description: 'Only set on GET /users/me/tasks',
  })
  project?: TaskProjectDto;

  @ApiProperty({ required: false, type: () => [CommentResponseDto] })
  comments?: CommentResponseDto[];

  @ApiProperty({ required: false, type: () => [AttachmentResponseDto] })
  attachments?: AttachmentResponseDto[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ required: false, nullable: true })
  deletedAt: Date | null;
}
