import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Response,
  HttpCode,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  Response as ExpressResponse,
  Request as ExpressRequest,
} from 'express';
import { Logger } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { AccountRecoveryService } from './account-recovery.service';
import {
  ForgotPasswordDto,
  ResetPasswordDto,
  TokenDto,
} from './dto/account-recovery.dto';
import { RegisterDto } from './dto/register.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import {
  SimpleThrottlerGuard,
  Throttle,
} from '../common/throttler/simple-throttler.guard';
import { TrustedOriginGuard } from '../common/guards/trusted-origin.guard';
import {
  REFRESH_COOKIE_NAME,
  getRefreshCookieOptions,
} from '../config/cookie.config';
import { getAppConfig } from '../config/app.config';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@Controller('auth')
@UseGuards(SimpleThrottlerGuard)
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private authService: AuthService,
    private recovery: AccountRecoveryService,
  ) {}

  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, type: AuthResponseDto })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  @Throttle({ limit: 5, windowMs: 60_000 })
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Response({ passthrough: true }) res: ExpressResponse,
  ) {
    const { refreshToken, ...body } = await this.authService.register(dto);
    this.setRefreshCookie(res, refreshToken);
    // Best-effort and not awaited: a slow mail server must not slow sign-up
    void this.recovery.sendVerificationEmailTo(dto.email);
    return body;
  }

  @ApiOperation({
    summary: 'Request a password-reset e-mail',
    description:
      'Always answers 204, whether or not the address is registered, so it cannot be used to discover accounts.',
  })
  @ApiResponse({ status: 204 })
  @Throttle({
    limit: 5,
    windowMs: 60_000,
    perEmail: { limit: 3, windowMs: 60 * 60_000 },
  })
  @HttpCode(204)
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto): void {
    // Not awaited: the response time must not depend on whether the account
    // exists (a DB write and an SMTP round trip would give it away).
    void this.recovery.requestPasswordReset(dto.email).catch((err: Error) => {
      this.logger.warn(`Password reset e-mail failed: ${err.message}`);
    });
  }

  @ApiOperation({
    summary: 'Set a new password with the token from the reset e-mail',
    description:
      'Ends every session of the account (refresh tokens revoked, access tokens invalidated).',
  })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  @Throttle({ limit: 10, windowMs: 60_000 })
  @HttpCode(204)
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.recovery.resetPassword(dto.token, dto.newPassword);
  }

  @ApiOperation({
    summary: 'Confirm the e-mail address with the e-mailed token',
  })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  @Throttle({ limit: 10, windowMs: 60_000 })
  @HttpCode(204)
  @Post('verify-email')
  async verifyEmail(@Body() dto: TokenDto): Promise<void> {
    await this.recovery.verifyEmail(dto.token);
  }

  @ApiOperation({ summary: 'Send the verification e-mail again' })
  @ApiResponse({ status: 204 })
  @Throttle({ limit: 3, windowMs: 60 * 60_000 })
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  @Post('resend-verification')
  async resendVerification(@CurrentUser() user: AuthUser): Promise<void> {
    await this.recovery.sendVerificationEmail(user.userId);
  }

  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @Throttle({
    limit: 10,
    windowMs: 60_000,
    perEmail: { limit: 20, windowMs: 15 * 60_000 },
  })
  @UseGuards(LocalAuthGuard)
  @HttpCode(200)
  @Post('login')
  async login(
    @Body() _body: LoginDto,
    @CurrentUser() user: AuthUser,
    @Response({ passthrough: true }) res: ExpressResponse,
  ): Promise<AuthResponseDto> {
    const { refreshToken, ...body } = await this.authService.login(
      user.userId,
      user.email,
      user.tokenVersion,
    );
    this.setRefreshCookie(res, refreshToken);
    return body;
  }

  @ApiOperation({
    summary: 'Refresh access token using the refresh-token cookie',
    description:
      'Reads the HttpOnly `refreshToken` cookie (no Authorization header needed), rotates it and returns a new access token.',
  })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({
    status: 401,
    description: 'Missing, invalid or reused refresh token',
  })
  @ApiResponse({ status: 403, description: 'Untrusted Origin' })
  @Throttle({ limit: 20, windowMs: 60_000 })
  @UseGuards(TrustedOriginGuard)
  @HttpCode(200)
  @Post('refresh')
  async refresh(
    @Request() req: ExpressRequest,
    @Response({ passthrough: true }) res: ExpressResponse,
  ) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];

    if (!refreshToken) {
      throw new UnauthorizedException('No refresh token provided');
    }

    const { refreshToken: newRefreshToken, ...body } =
      await this.authService.refreshTokens(refreshToken);
    this.setRefreshCookie(res, newRefreshToken);
    return body;
  }

  @ApiOperation({ summary: 'Logout and clear refresh token' })
  @ApiResponse({ status: 201, description: 'Refresh cookie cleared' })
  @ApiResponse({ status: 403, description: 'Untrusted Origin' })
  @Throttle({ limit: 20, windowMs: 60_000 })
  @UseGuards(TrustedOriginGuard)
  @Post('logout')
  async logout(
    @Request() req: ExpressRequest,
    @Response({ passthrough: true }) res: ExpressResponse,
  ) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];

    if (typeof refreshToken === 'string') {
      await this.authService.logout(refreshToken);
    }

    res.clearCookie(REFRESH_COOKIE_NAME, getRefreshCookieOptions());
    return { message: 'Logged out successfully' };
  }

  private setRefreshCookie(res: ExpressResponse, token: string) {
    res.cookie(REFRESH_COOKIE_NAME, token, {
      ...getRefreshCookieOptions(),
      maxAge: getAppConfig().jwt.refreshTtlMs,
    });
  }
}
