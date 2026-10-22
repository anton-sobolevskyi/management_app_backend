import {
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { NormalizeEmail } from '../../common/decorators/normalize-email.decorator';
import { MaxBytes } from '../../common/decorators/max-bytes.decorator';

export class RegisterDto {
  @ApiProperty({ example: 'alice@example.com' })
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({
    example: 'Secret1!',
    description:
      'At least 8 characters, including a letter and a number. At most 72 bytes (bcrypt limit).',
  })
  @IsString()
  @MinLength(8)
  @MaxBytes(72)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'Password must contain at least one letter and one number',
  })
  password: string;

  @ApiProperty({ example: 'Alice' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;
}
