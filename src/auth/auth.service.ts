import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { hashToken } from '../common/utils/token-hash';
import { normalizeEmail } from '../common/utils/email';
import { getAppConfig } from '../config/app.config';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  /** Lazily built bcrypt hash used to keep unknown-email logins as slow as real ones. */
  private dummyHash?: Promise<string>;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<IssuedTokens> {
    const email = normalizeEmail(dto.email);

    const existingUser = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(
      dto.password,
      getAppConfig().bcryptRounds,
    );

    // A concurrent registration of the same email loses on the unique index;
    // the exception filter turns that P2002 into a 409.
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        name: dto.name,
      },
    });

    return this.generateTokens(user.id, user.email);
  }

  async validateUser(rawEmail: string, password: string) {
    // Runs before the ValidationPipe (passport-local), so normalise here too
    const email = normalizeEmail(rawEmail);

    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });

    if (!user) {
      // Spend the same time as a real comparison so response timing doesn't
      // reveal which emails are registered.
      await bcrypt.compare(password, await this.getDummyHash());
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return null;
    }

    const { passwordHash, ...result } = user;
    return result;
  }

  async login(userId: string, email: string): Promise<IssuedTokens> {
    return this.generateTokens(userId, email);
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

    // A rotated or logged-out token is being replayed: either a stale client
    // or a stolen token. End every live session of this user to be safe.
    if (stored.revoked) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revoked: false },
        data: { revoked: true },
      });
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.expiresAt < new Date() || stored.user.deletedAt) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Atomic compare-and-set: of two concurrent requests presenting the same
    // token, only one flips `revoked` and may mint a new pair.
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revoked: false },
      data: { revoked: true },
    });

    if (count === 0) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.generateTokens(stored.user.id, stored.user.email);
  }

  async logout(refreshToken: string) {
    const tokenHash = hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { token: tokenHash },
      data: { revoked: true },
    });
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= bcrypt.hash(randomUUID(), getAppConfig().bcryptRounds);
    return this.dummyHash;
  }

  private async generateTokens(
    userId: string,
    email: string,
  ): Promise<IssuedTokens> {
    const { jwt } = getAppConfig();
    const payload = { sub: userId, email };

    const accessToken = this.jwtService.sign(payload, {
      secret: jwt.accessSecret,
      expiresIn: jwt.accessExpiresInSeconds,
    });

    // jwtid makes every refresh token unique. Without it, two tokens minted for
    // the same user within one second are byte-identical and collide on the
    // unique `token` column (login + immediate refresh -> 500).
    const refreshToken = this.jwtService.sign(payload, {
      secret: jwt.refreshSecret,
      expiresIn: Math.floor(jwt.refreshTtlMs / 1000),
      jwtid: randomUUID(),
    });

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
