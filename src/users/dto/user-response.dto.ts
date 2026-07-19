import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ example: 'alice@example.com' })
  email: string;

  @ApiProperty({ example: 'Alice Johnson' })
  name: string;

  @ApiProperty({ required: false, nullable: true, example: 'attachment-uuid' })
  avatarId: string | null;

  @ApiProperty()
  createdAt: Date;
}
