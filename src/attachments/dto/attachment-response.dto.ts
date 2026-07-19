import { ApiProperty } from '@nestjs/swagger';
import { AttachmentType } from '../../generated/prisma';

export class AttachmentResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'homepage-wireframe.png' })
  fileName: string;

  @ApiProperty({ example: 'image/png' })
  mimeType: string;

  @ApiProperty({ example: 812450 })
  sizeBytes: number;

  @ApiProperty({ enum: AttachmentType })
  type: AttachmentType;

  @ApiProperty()
  uploadedById: string;

  @ApiProperty({ required: false, nullable: true })
  taskId: string | null;

  @ApiProperty({ required: false, nullable: true })
  commentId: string | null;

  @ApiProperty()
  createdAt: Date;
}
