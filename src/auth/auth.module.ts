import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { AccountTokensService } from './account-tokens.service';
import { AccountRecoveryService } from './account-recovery.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { TokenCleanupService } from './token-cleanup.service';
import { PasswordService } from './password.service';
import { SimpleThrottlerGuard } from '../common/throttler/simple-throttler.guard';

@Module({
  imports: [PrismaModule, MailModule, PassportModule, JwtModule.register({})],
  providers: [
    AuthService,
    AccountTokensService,
    AccountRecoveryService,
    PasswordService,
    JwtAuthGuard,
    LocalAuthGuard,
    JwtStrategy,
    LocalStrategy,
    SimpleThrottlerGuard,
    TokenCleanupService,
  ],
  controllers: [AuthController],
  exports: [AccountRecoveryService, PasswordService],
})
export class AuthModule {}
