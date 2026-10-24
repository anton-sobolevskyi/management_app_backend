import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { hashToken } from '../common/utils/token-hash';
import { normalizeEmail } from '../common/utils/email';
import { AppConfigService } from '../config/app-config.service';
import { PasswordService } from './password.service';
import { revokeAllRefreshTokens } from './refresh-token.util';

/**
 * A refresh token that was rotated (or logged out) a moment ago may still be
 * presented by a second tab or a retried request. Within this window that is
 * treated as a stale client, not as token theft, so it does not end every
 * session of the user.
 */
export const REFRESH_REUSE_GRACE_MS = 20_000;

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: AppConfigService,
    private passwords: PasswordService,
  ) {}

  async register(dto: RegisterDto): Promise<IssuedTokens> {
    const email = normalizeEmail(dto.email);

    const existingUser = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await this.passwords.hash(dto.password);

    // A concurrent registration of the same email loses on the unique index;
    // the exception filter turns that P2002 into a 409.
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        name: dto.name,
      },
    });

    return this.generateTokens(user.id, user.email, user.tokenVersion);
  }

  async validateUser(rawEmail: unknown, password: unknown) {
    // Runs before the ValidationPipe (passport-local), so the body is untrusted:
    // objects/numbers would make trim()/bcrypt throw and surface as a 500.
    if (typeof rawEmail !== 'string' || typeof password !== 'string') {
      return null;
    }

    const email = normalizeEmail(rawEmail);

    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });

    if (!user) {
      // Spend the same time as a real comparison so response timing doesn't
      // reveal which emails are registered.
      await this.passwords.verifyAgainstDummy(password);
      return null;
    }

    const isPasswordValid = await this.passwords.verify(
      password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      return null;
    }

    const { passwordHash, ...result } = user;
    return result;
  }

  async login(
    userId: string,
    email: string,
    tokenVersion = 0,
  ): Promise<IssuedTokens> {
    return this.generateTokens(userId, email, tokenVersion);
  }

  async refreshTokens(refreshToken: string): Promise<IssuedTokens> {
    const tokenHash = hashToken(refreshToken);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: tokenHash },
      include: { user: true },
    });

    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // A rotated or logged-out token is being replayed. Right after rotation
    // that is a second tab / retried request: just reject it. Later it is
    // either a stale client or a stolen token, so end every live session.
    if (stored.revoked) {
      const withinGrace =
        stored.revokedAt !== null &&
        Date.now() - stored.revokedAt.getTime() < REFRESH_REUSE_GRACE_MS;

      if (!withinGrace) {
        await revokeAllRefreshTokens(this.prisma, stored.userId);
      }
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.expiresAt < new Date() || stored.user.deletedAt) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Atomic compare-and-set: of two concurrent requests presenting the same
    // token, only one flips `revoked` and may mint a new pair.
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revoked: false },
      data: { revoked: true, revokedAt: new Date() },
    });

    if (count === 0) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.generateTokens(
      stored.user.id,
      stored.user.email,
      stored.user.tokenVersion,
    );
  }

  async logout(refreshToken: string) {
    const tokenHash = hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { token: tokenHash, revoked: false },
      data: { revoked: true, revokedAt: new Date() },
    });
  }

  private async generateTokens(
    userId: string,
    email: string,
    tokenVersion: number,
  ): Promise<IssuedTokens> {
    const { jwt } = this.config;

    // `tv` lets a password change invalidate access tokens immediately.
    const accessToken = this.jwtService.sign(
      { sub: userId, email, tv: tokenVersion },
      {
        secret: jwt.accessSecret,
        algorithm: 'HS256',
        expiresIn: jwt.accessExpiresInSeconds,
      },
    );

    // Refresh tokens are opaque random strings: they are only ever looked up
    // by hash in the database, so a signed JWT added size but no security.
    const refreshToken = randomBytes(32).toString('base64url');

    await this.prisma.refreshToken.create({
      data: {
        token: hashToken(refreshToken),
        userId,
        expiresAt: new Date(Date.now() + jwt.refreshTtlMs),
      },
    });

    return { accessToken, refreshToken, expiresIn: jwt.accessExpiresInSeconds };
  }
}
