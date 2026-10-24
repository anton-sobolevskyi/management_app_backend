import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class DeleteAccountDto {
  @ApiProperty({
    description: 'The account password, re-entered to confirm the deletion.',
  })
  @IsString()
  @MaxLength(1024)
  currentPassword: string;
}
