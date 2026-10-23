import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { NormalizeEmail } from '../../common/decorators/normalize-email.decorator';
import { MaxBytes } from '../../common/decorators/max-bytes.decorator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'alice@example.com' })
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email: string;
}

export class TokenDto {
  @ApiProperty({ description: 'The token from the e-mailed link' })
  @IsString()
  @Length(20, 200)
  token: string;
}

export class ResetPasswordDto extends TokenDto {
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
  newPassword: string;
}
