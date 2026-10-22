import { IsEmail, IsString, MaxLength } from 'class-validator';
import { NormalizeEmail } from '../../common/decorators/normalize-email.decorator';

export class LoginDto {
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email: string;

  // Generous cap only: accounts created before the 72-byte rule may have
  // longer passwords (bcrypt used just the first 72 bytes), so don't lock them out.
  @IsString()
  @MaxLength(1024)
  password: string;
}
