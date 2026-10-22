import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength, Matches } from 'class-validator';
import { MaxBytes } from '../../common/decorators/max-bytes.decorator';

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MaxLength(1024)
  currentPassword: string;

  @ApiProperty({
    description:
      'At least 8 characters, including a letter and a number. At most 72 bytes.',
  })
  @IsString()
  @MinLength(8)
  @MaxBytes(72)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'Password must contain at least one letter and one number',
  })
  newPassword: string;
}
