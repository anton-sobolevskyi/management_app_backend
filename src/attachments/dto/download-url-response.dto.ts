import { ApiProperty } from '@nestjs/swagger';

export class DownloadUrlResponseDto {
  @ApiProperty({
    example:
      'https://s3.eu-west-1.amazonaws.com/bucket/key?X-Amz-Signature=...',
  })
  url: string;

  @ApiProperty({ example: 'homepage-wireframe.png' })
  fileName: string;

  @ApiProperty({ example: 'image/png' })
  mimeType: string;
}
