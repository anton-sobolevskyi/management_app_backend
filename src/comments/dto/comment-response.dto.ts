import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '../../users/dto/user-response.dto';
import { AttachmentResponseDto } from '../../attachments/dto/attachment-response.dto';

export class CommentResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'Looks great! Can we make the hero section taller?' })
  content: string;

  @ApiProperty()
  taskId: string;

  @ApiProperty()
  authorId: string;

  @ApiProperty({ required: false, type: () => UserResponseDto })
  author?: UserResponseDto;

  @ApiProperty({ required: false, type: () => [AttachmentResponseDto] })
  attachments?: AttachmentResponseDto[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
